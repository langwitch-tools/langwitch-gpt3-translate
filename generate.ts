import * as process from "https://deno.land/std@0.145.0/node/process.ts";
import * as fs from "https://deno.land/std@0.145.0/node/fs/promises.ts";
import { pipeWith, pipe } from "https://esm.sh/ramda@0.28.0";
import { parse } from "https://deno.land/std/flags/mod.ts";

type str = string;
type Fn = (...a0: any[]) => any;

const aPipe = pipeWith((fn, res) =>
	Promise.resolve(res).then((a) => tryElse(fn)(a))
);

type ConfigJson = {
	fromLangCode: str;
	toLangCode: str;
	toLangName: str;
	//examplePair: [str, str];
	outputFile: str;
	inputFile: str;
	concurrency: number;
	progressWriter: (s: unknown) => void;
};

const makeClient =
	(apiKey: string) =>
	({ model, input, instruction }: { [key: string]: string }) =>
		fetch("https://api.openai.com/v1/edits", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: model,
				input: input,
				instruction: instruction,
			}),
		})
			.then((r) => r.json())
			.then((r) => {
				console.log(r);
				return r;
			});

// todo: figure this out
// maybe use an io monad or a reader?
// in any case, need to separate out the pure code from the impure code that requires openai (as in fn => fn => str)
// cheap hack: take it as command-line input or as an env variable. could get annoying.
// pipe - can already tell this will cause god knows how many hidden problems.
// need some kind of error-matching syntax. existing libs?
// make it work in deno / browser?. no one wants to install a whole fuckin library just to use one script.

const createClient = () => {
	const key = process.env["OPENAI_API_KEY"];
	if (key === undefined) {
		console.log("you need to put this before the command:");
		console.log("OPENAI_API_KEY=\"qe30ue88udlqwkjdi\"");
	}
	const CLIENT = {
		createEdit: makeClient(process.env["OPENAI_API_KEY"]), //throw err here if not found
	};
	return () => CLIENT;
};

const openai = createClient();

const tryElse =
	<F extends Fn>(fn: F) =>
	async (args: Parameters<F>) => {
		try {
			return await fn(args);
		} catch (e) {
			console.error(e);
			return e;
		}
	};

const failed = (v: unknown) =>
	v === undefined || v === null || v instanceof Error;

const remove = (s: string) => async (t: string) => await t.replace(s, "");

const fetchResponse = ({
	body,
	csvHeader,
	examples,
	toLangName,
}: {
	[key: string]: string;
}) =>
	aPipe([
		() =>
			openai().createEdit({
				input: csvHeader + "\n" + examples + body,
				instruction: `Fill in the second column of this CSV file with each sentence accurately and idiomatically translated into ${toLangName} in the second column`,
				model: "text-davinci-edit-001",
			}),
		(r: any) => r.choices[0]["text"],
		remove(csvHeader + "\n"),
		remove(examples),
	]);

type Cond<A> = (arg0: A) => boolean;

const loopUntil =
	<A>(shouldBreak: Cond<A>) =>
	(tryReturn: () => Promise<A>) =>
	async () => {
		for (;;) {
			const r = await tryReturn();
			if (shouldBreak(r)) {
				return r;
			}
		}
	};

const throttle =
	<A>(getMs: () => number) =>
	(fn: () => Promise<A>) =>
	async (): Promise<A> =>
		await new Promise((resolve) =>
			setTimeout(async () => resolve(await fn()), getMs())
		);

const throttledLoop = <A>({
	shouldBreak,
	getMs,
}: {
	shouldBreak: Cond<A>;
	getMs: () => number;
}) => pipe(throttle<A>(getMs), loopUntil(shouldBreak));

type CsvInit = {
	fromLangCode: str;
	toLangCode: str;
	sentences: str[];
	examplePair?: [str, str] | undefined;
	toLangName: str;
};

const makeCsv = ({
	fromLangCode,
	toLangCode,
	sentences,
	examplePair,
	toLangName,
}: CsvInit) => ({
	csvHeader: `"${fromLangCode}","${toLangCode}"`,
	examples:
		examplePair !== undefined && examplePair.length === 2
			? `"${examplePair[0]}","${examplePair[1]}"\n`
			: "",
	body: sentences
		.filter((s: str) => s.length > 1)
		.map((s: str) => `"${s}",""`)
		.join("\n"),
	toLangName: toLangName,
});

/*console.log(
	makeCsv({
		fromLangCode: "en",
		toLangCode: "fr",
		sentences: ["I love you", "I am a shoe", "What shall we do?"],
		examplePair: ["I don't speak French", "je ne parle pas le francais"],
		toLangName: "Parisian French"
	})
)*/

const throttleRequester = <A extends string>(reqfn: () => Promise<A>) =>
	throttledLoop({
		shouldBreak: (r: A) => !failed(r),
		getMs: () => Math.random() * 5000,
	})(reqfn);

const log = <T>(a: T) => {
	console.log(a);
	return a;
};
const createInstruction = (dict: CsvInit) =>
	throttleRequester(() => pipe(makeCsv, log, fetchResponse)(dict)());

const progressMetre = (progressWriterFn: (s: str) => void) => {
	let total = 0;
	return (_a: unknown) => {
		total += 1;
		progressWriterFn(`Completed ${total}`);
		return _a;
	};
};

const createTasks =
	(cfg: ConfigJson) =>
	(instructionCreatorFn: (t: CsvInit) => () => Promise<string>) =>
	(lineChunks: str[]) =>
		lineChunks.map((ch: string) =>
			instructionCreatorFn({
				sentences: ch.split("\n"),
				...cfg,
			})
		);

const executeTasks = (concurrency: number) =>
	async function* (tasks: (() => Promise<string>)[]) {
		for (;;) {
			const shuffled = [...tasks];
			shuffled.sort(() => (Math.random() > 0.5 ? 1 : -1));
			const todo = shuffled.slice(0, concurrency);
			for (const res of await Promise.all(todo.map((t) => t()))) {
				yield res;
			}
		}
	};

const mapgen = <A, B>(fn: (a0: A) => B) =>
	async function* (generator: AsyncGenerator<A>) {
		for await (const item of generator) {
			yield await fn(item);
		}
	};

const appendTo = (filename: str) => async (data: str) => {
	await fs.appendFile(filename, data);
	return data;
};

const readFrom = (filename: str) => fs.readFile(filename, "utf-8");

const linesToChunks =
	(max = 600) =>
	(text: string) =>
		text
			.split("\n")
			.filter((l) => l.length > 1)
			.reduce(
				(acc: string[], currLine: string) =>
					acc.length === 0
						? [currLine]
						: acc.slice(-1)[0].length + currLine.length > max
						? [...acc, currLine]
						: [
								...acc.slice(0, -1),
								acc.slice(-1)[0] + "\n" + currLine,
						  ],
				[]
			);

const consume = async <T>(gen: AsyncGenerator<T>) => {
	for await (const _ of gen) {
		//
	}
};

// takes a filename as input
const io = (cfg: ConfigJson) =>
	aPipe([
		() => readFrom(cfg.inputFile),
		linesToChunks(500),
		createTasks(cfg)(createInstruction),
	]);

const runIo = (cfg: ConfigJson) => async (tasks: (() => Promise<string>)[]) => {
	const g1 = executeTasks(cfg.concurrency)(tasks);
	const sideEffects = pipe(
		appendTo(cfg.outputFile),
		progressMetre(cfg.progressWriter)
	);
	await pipe(mapgen(sideEffects), consume)(g1);
};

const run = (cfg: ConfigJson) => aPipe([io(cfg), runIo(cfg)]);

// deno run --allow-net --allow-write generate.ts --from="en" --to="es" --lang="Spanish in the Madrid dialect, with informal slang if necessary" --write-to="output.csv" --read-from="sentences.txt"

const parseArg = ({
	name
}: {
	name: str;
}) => {
	const r = parse(Deno.args)[name];
	if (r === undefined) {
		throw new Error("(╥_╥)	you forgot this flag: --" + name);
	}
	return r;
};

const PARSED_CONFIG = {
	fromLangCode: parseArg({name: "from"}),
	toLangCode: parseArg({name: "to"}),
	toLangName: parseArg({name: "lang"}),
	outputFile: parseArg({name: "write-to"}),
	concurrency: 2,
	inputFile: parseArg({name: "read-from"}),
	progressWriter: console.log,
};

console.log(PARSED_CONFIG);

await run(PARSED_CONFIG)();
