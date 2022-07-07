![hi](https://github.com/langwitch-tools/assets/blob/main/langwitch-header.png)

(if you just want the translations, they're in the translations folder. but you can read this if you want to make your own)

### what does it do?

it uses gpt-3 to translate sentences into whatever language you want, in whatever dialect or style or register you want, so long as your language is at least [more common on the internet than catalan](https://commoncrawl.github.io/cc-crawl-statistics/plots/languages). 

the good thing is that it can do informal translations that are very hard to find in textbooks and from official sources. here's a comparison with google translate for a few different languages:

| english | gpt-3 | google translate |
| ---- | ---- | ---- |
| If you still want it.	| Si t'en as encore envie. | Si vous le voulez toujours |
| I want to try to buy snacks again. | Aku mau coba beli cemilan lagi. | Saya ingin mencoba membeli makanan ringan lagi. |
| Do you know who gave her the money? |  Weißt Du, wer ihr das Geld gegeben hat? | Wissen Sie, wer ihr das Geld gegeben hat? |

notice how it uses t'en instead of vous, aku mau vs saya ingin, and weißt Du, rather than wissen Sie

### what do i need to make it work

you need a list of sentences you want translated and you need the openai key you probably made when the greentext memes became popular. you put them in a file with each one on a new line and that's kinda it. oh wait you also need deno but luckily it's really ridiculously easy to install in one line ([this is their website](https://deno.land/manual/getting_started/installation)) and it didn't mess up any other things i had on my computer, so it has my approval.

i added some sentence files in this repo if you want to use them but honestly they kinda suck. take a look at them yourself i guess.

### how do i make it work

to run it, you do this – i'm going to put it on separate lines, you don't have to do the \ backtick thing

```sh
OPENAI_API_KEY="dksljfdjkfhsjdhjf" \
deno run --allow-net --allow-write https://raw.githubusercontent.com/langwitch-tools/langwitch-gpt3-translate/main/generate.ts \
--from="en" --to="es" --lang="Spanish in the Madrid dialect, with informal slang if necessary" \
--write-to="output.csv" --read-from="sentences.txt"
```

### important notes

* i made it go very slowly because openai rate-limits requests. i think i started this script at around 5pm for german, and now it's 7:25pm. it has translated only 36,755 sentences during that time. so if you are impatient you should maybe start it before you go to bed and let it run overnight. dunno. up to you.

* it will be very noisy. gpt-3 is a smart little critter but it sometimes forgets how to format csv files properly or just doesn't fill out any columns with translations. i will add some post-processing scripts tmrw
