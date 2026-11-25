type Occasion = {
  name: string;
  title: string;
  description: string;
  heading: string;
  introduction: string;
  ideas: { heading: string; detail: string }[];
  prompt: string;
  lyricExample?: { lines: string[]; demoSlug?: string };
  reading?: { href: string; label: string }[];
  mood: string;
  question: string;
  answer: string;
  gifting: { heading: string; detail: string };
};

export const occasions: Record<string, Occasion> = {
  christmas: {
    name: "Christmas",
    title: "Personalized Christmas Song Gifts from Your Memories | songforalways",
    description: "Turn a family tradition into a personalized Christmas song. Read a fictional story and lyric example, hear the matching sample, and start your own lyrics for free.",
    heading: "A Christmas gift with your own story inside.",
    introduction: "The gifts people remember often begin with something small: a familiar greeting, a recipe you make together or a call across the miles. Turn a Christmas memory into a personal song for a partner, parent, friend or chosen family. Tell us what the season means to you, without needing to write the lyrics yourself.",
    ideas: [
      { heading: "Choose one tradition that belongs to you", detail: "Describe the detail that makes your celebration familiar: a kitchen full of conversation, a decoration with a story or the message someone always sends. You do not need snow, a tree or a particular kind of Christmas to make the song personal." },
      { heading: "Put the recipient in the memory", detail: "Include their name, your relationship and an action you remember. A sister rescuing the dessert or a friend setting another place at the table gives the song more to work with than a list of festive words." },
      { heading: "Say what you want to give them this year", detail: "A thank-you, a wish or a reminder that they are missed can guide the chorus. Explain whether you want religious language, a secular celebration or simply a warm personal message. Check these choices when reviewing the lyrics." },
    ],
    prompt: "Every Christmas our family bakes an orange cake from the same handwritten recipe. We live apart now, so we set up a video call and bake in two kitchens. I want a warm, joyful song about how that half hour keeps the tradition going.",
    lyricExample: {
      demoSlug: "christmas-demo",
      lines: ["Pass the orange, measure out the flour", "We make a kitchen from a shared half hour"],
    },
    reading: [
      { href: "/guides/give-a-personal-song-gift", label: "Plan how to give your Christmas song" },
      { href: "/occasions/christmas-eve", label: "Christmas Eve song ideas" },
      { href: "/occasions/new-year", label: "New Year song ideas" },
    ],
    mood: "Warm and heartfelt can suit a family thank-you, while joyful and bright works for a playful gift. Choose a music direction the recipient enjoys. Describe the festive feeling in your own words; songforalways makes an original song rather than a cover of an existing Christmas recording.",
    question: "Can I make a non-religious Christmas song?",
    answer: "Yes. Say which traditions and words fit your celebration and which to leave out. Review the free lyric draft carefully before paying for music. You can correct names, remove a line or change the message before generation starts.",
    gifting: { heading: "Make room for a listening moment", detail: "Start early enough to review the lyrics, listen to the finished recording and download a backup before Christmas. From a completed song, you can choose to enable a private gift link and add a greeting, or give the audio file directly. A holiday selection does not guarantee delivery by a particular date." },
  },
  "christmas-eve": {
    name: "Christmas Eve",
    title: "Personalized Christmas Eve Songs for Someone Special | songforalways",
    description: "Create a Christmas Eve song about the little traditions and people you share the evening with. Find story ideas and review your lyrics for free.",
    heading: "For the little moments before Christmas morning.",
    introduction: "Christmas Eve can be a busy gathering, a quiet evening or a call to someone far away. A personal song can hold the small ritual that makes December 24 feel like yours. Share a real memory and the message you want someone to hear, whether the song is a surprise for one person or a dedication from the family.",
    ideas: [
      { heading: "Start with a scene from the evening", detail: "Think of a sound, a shared meal, a walk or a conversation after everyone else has gone to bed. Describe what actually happened. A specific scene helps the lyrics feel personal without relying on familiar Christmas clichés." },
      { heading: "Explain who is sharing the moment", detail: "Tell us the recipient's name and whether the message comes from you, a couple or a family. If you spend the evening apart, describe the way you stay connected. Leave out private details that do not belong in a gift." },
      { heading: "Set the tone for the listening moment", detail: "You might want a peaceful thank-you, a bright family celebration or a hopeful message. Say whether faith is part of the story. Do not assume that everyone shares the same traditions or wants a surprise played in front of a group." },
    ],
    prompt: "This song is for my mum, June, on Christmas Eve. When I was little we wrapped presents at the kitchen table and she always saved a crooked ribbon for the last one. Now we live far apart, so we make tea and wrap gifts together over a video call. I want a gentle, grateful song about keeping that evening close, without religious language.",
    mood: "Nostalgic and gentle or warm and heartfelt can fit an intimate evening gift. A soft piano ballad or acoustic pop can be a starting point. Give the story and feeling room to guide the result; the recording uses AI-generated vocals and is an original composition.",
    question: "Is Christmas Eve different from the Christmas option?",
    answer: "Both create an original song from your story. Christmas Eve gives you prompts for December 24 and its evening traditions; Christmas focuses on the wider celebration and gifting. Select the occasion that fits, then describe the particular message you want in the story field.",
    gifting: { heading: "Let them choose when to press play", detail: "Check the finished audio in advance and download a copy. You can add a short greeting and enable the private gift link from the completed song, or send the audio privately. Allow time for generation and checking; the Christmas Eve option does not promise completion by a deadline." },
  },
  "new-year": {
    name: "New Year",
    title: "Personalized New Year Song Gifts for a New Beginning | songforalways",
    description: "Celebrate the year you shared and the hopes ahead with a personal New Year song. Explore memory prompts and edit your lyrics before creating music.",
    heading: "A song for the year you shared. And the one ahead.",
    introduction: "A New Year message does not need a list of achievements or a perfect resolution. It can begin with someone who stayed beside you, a small change you are proud of or an ordinary day you want to remember. Make a personal song for January 1, a New Year's Eve gathering or a quieter new beginning.",
    ideas: [
      { heading: "Choose a moment from the year", detail: "Describe one real scene: a move, an unexpected adventure or a difficult week made easier by someone. Say why that moment mattered. Include the year explicitly if you want it sung; the song should not have to guess dates." },
      { heading: "Thank someone for a particular kindness", detail: "Give their name and the thing they did that stayed with you. Explain whether the message is from one person, a couple or a group, so the lyrics can use the right relationships and perspective." },
      { heading: "End with a hope you can mean", detail: "A wish to make more time for each other can be as meaningful as a big ambition. Describe the tone you want: reflective, joyful or hopeful. Avoid putting pressure on the recipient to make promises or meet expectations." },
    ],
    prompt: "This New Year song is for my friend Sam. This year we moved into our first flat and learned to cook, mostly by getting it wrong. When work was difficult he always made time for a walk by the river. I want to thank him for showing up and say that I hope the next year brings more ordinary adventures together. Keep it hopeful and light.",
    mood: "Uplifting and hopeful can suit a fresh start, while nostalgic and gentle works for looking back. Choose the music direction for the recipient rather than the calendar. Mention the year and any date you want included, then check the generated words before starting the music.",
    question: "Can the song be for New Year's Eve as well as New Year's Day?",
    answer: "Yes. Select New Year's Day in the form and explain whether you plan to give the song on December 31, January 1 or another date. For a countdown, ask for a chorus that a group can sing back. For a quiet January gift, try a verse about one moment this year and a chorus about one hope for the next. Check any dates and promises in the draft before starting the recording.",
    reading: [{ href: "/guides/turn-memories-into-a-song", label: "Turn a memory from this year into a song" }],
    gifting: { heading: "Check the gift before the countdown", detail: "Make time to listen to the recording and download a backup before your gathering or private listening moment. A completed song can be given as an audio file or through an optional private gift link. Generation time varies, so the New Year option is not a promise of instant or deadline delivery." },
  },
  birthday: {
    name: "Birthday",
    title: "Personalized Birthday Song Gift | songforalways",
    description: "Create a personalized birthday song from a shared memory. Read a story and lyric example, hear the birthday sample, and start your own lyrics for free.",
    heading: "A birthday song that sounds like their story.",
    introduction: "A birthday is a chance to say more than “happy birthday.” Think about the little things they do, the moments you laugh about together, and what you hope the next year brings. Those details give a personalized birthday song a voice that a greeting card cannot.",
    ideas: [
      { heading: "A detail only you would know", detail: "Mention a nickname, a favorite place, or the way they turn an ordinary day around. One specific image can say more than a list of compliments." },
      { heading: "A memory with a beginning", detail: "Recall a trip, a celebration, or a quiet conversation. Share what happened and why it stayed with you, so the lyrics have a real scene to draw from." },
      { heading: "A wish for the year ahead", detail: "Tell them what you admire and what you hope they get to experience next. This gives the song a closing thought that feels like a gift." },
    ],
    prompt: "This is for my friend Alex. They put the kettle on before anyone asks and make room for everyone at the table. Once we took a wrong turn on a road trip, and Alex made getting lost the best part of the day. I'd like a warm birthday song that thanks them for keeping us together and wishes them another good adventure.",
    lyricExample: {
      demoSlug: "birthday-demo",
      lines: ["Alex, here's a day with room for you", "For the little things you always do"],
    },
    reading: [{ href: "/guides/turn-memories-into-a-song", label: "Find a memory to start your birthday song" }],
    mood: "Choose joyful and bright for a celebration, or warm and heartfelt if you want the song to feel like a personal letter. You can also choose a music direction such as acoustic pop or piano ballad.",
    question: "Do I need to write the lyrics myself?",
    answer: "No. Tell us the story in your own words. You can read and edit the generated lyrics before deciding whether to pay for the finished song.",
    gifting: { heading: "Give them a moment to listen", detail: "Download the finished audio before the birthday and test it on the device you plan to use. Pair it with a short note about the memory behind the song, or send the audio privately so they can listen in their own time. Share the downloaded file, rather than your signed-in songforalways account page." },
  },
  wedding: {
    name: "Wedding",
    title: "Personalized Wedding Song from Your Love Story | songforalways",
    description: "Create a wedding song inspired by your own love story. Share the moments that brought you together, review the lyrics, and choose the feeling of the music.",
    heading: "Let your wedding song tell the story behind the vows.",
    introduction: "A wedding song can hold the moments guests may never have seen: the first conversation, the ordinary routines that became home, and the promise you want to make together. Start with a few honest details rather than trying to write a perfect speech.",
    ideas: [
      { heading: "Where your story began", detail: "Describe the first meeting or the moment you realized this relationship was different. A place, a season, or a shared joke can anchor the opening verse." },
      { heading: "What life together feels like", detail: "Think about Sunday rituals, long-distance calls, or the way you support each other. These are the details that make the song yours instead of a generic love song." },
      { heading: "The promise you want to carry forward", detail: "Add a hope for the years ahead. It might be big, like building a home, or small, like always finding time to dance in the kitchen." },
    ],
    prompt: "We're getting married after seven years together. We met while volunteering at a community garden, and we still stop at the same café after every Saturday walk. Through a move to a new city, we have kept choosing each other. I want a gentle song about finding home in a person and promising to keep showing up.",
    mood: "Romantic and intimate works well for a quiet dedication. For an upbeat celebration, try joyful and bright. Pick the mood and music direction that fit the people in your story.",
    question: "Can I change the words before the music is made?",
    answer: "Yes. The lyrics are shown for review and editing before checkout and song generation, so you can correct details or make the message sound more like you.",
    gifting: { heading: "Plan the listening moment before the big day", detail: "Listen to the complete recording and download a backup before deciding where it fits. A private dedication can be a thoughtful moment together. If you want to use it at a ceremony, venue or public event, check the relevant permissions and playback arrangements first; a personal song purchase does not automatically cover every use." },
  },
  anniversary: {
    name: "Anniversary",
    title: "Personalized Anniversary Song Gift | songforalways",
    description: "Celebrate the years you have shared with a personalized anniversary song. Turn your favorite memories and everyday traditions into lyrics you can review.",
    heading: "An anniversary song for everything you have built together.",
    introduction: "An anniversary marks more than a date. It is a collection of places, changes, inside jokes, and ordinary days you chose to share. A personalized song can bring those memories into one thoughtful gift, whether you are celebrating your first year or many years together.",
    ideas: [
      { heading: "Begin with a shared place", detail: "It could be where you met, your first home, or the table you return to every year. A familiar setting helps the lyrics feel grounded in your life." },
      { heading: "Remember what changed", detail: "Mention a challenge you faced, a new beginning, or something you learned about each other. The years in between matter as much as the day you met." },
      { heading: "Keep an everyday tradition", detail: "Maybe you make coffee for each other, take the same walk, or never finish a film without talking through it. Small routines often carry the most affection." },
    ],
    prompt: "I want to give my partner an anniversary song about the life we built together. I remember the chipped green mug, our Saturday train trips and the kitchen shelf we made that still leans a little. Make it gentle and warm, like a morning when we have time to sit down together.",
    lyricExample: {
      demoSlug: "anniversary-demo",
      lines: ["One chipped green mug and a window full of rain", "A folded map for our Saturday train"],
    },
    reading: [{ href: "/guides/review-lyrics-before-music", label: "Check names, dates and memories in your anniversary lyrics" }],
    mood: "Nostalgic and gentle can suit a reflective gift; warm and heartfelt gives it the feeling of a letter. If your memories are full of laughter, a brighter direction may fit better.",
    question: "What if I only have a few details to share?",
    answer: "A few specific memories are enough to begin. Include who the song is for, one moment you both remember, and what you want them to hear now. You can refine the lyrics afterward.",
    gifting: { heading: "Let the memory lead the gift", detail: "Play the downloaded song during a quiet evening together, or send the audio with a photograph from the place mentioned in the lyrics. Read through names, dates and the anniversary number before starting the music. The finished recording reflects the lyrics used when generation begins." },
  },
  family: {
    name: "Family",
    title: "Personalized Family Song Gifts | songforalways",
    description: "Create a personal song for a parent, child, grandparent or chosen family. Find story ideas, review your AI lyrics, and give them a song to keep.",
    heading: "A family song for the people who feel like home.",
    introduction: "Family stories often live in small routines: the ride home after practice, a recipe nobody measures, or a message that always arrives when you need it. A personal song can say thank you to a parent, celebrate a child, or recognize the people you have chosen as family. Begin with one relationship and a memory that explains what it means to you.",
    ideas: [
      { heading: "Choose who is speaking to whom", detail: "A song from a daughter to her dad feels different from a dedication from all the grandchildren. Say whose voice the words should represent and which names belong in the story. This helps the lyrics keep a clear point of view." },
      { heading: "Remember an ordinary act of care", detail: "Describe something they actually did: waiting at the bus stop, fixing a favorite toy, or listening during a difficult week. Explain how it made you feel. An everyday scene can carry more warmth than a long list of family milestones." },
      { heading: "Include the people who matter", detail: "Use the names and relationships that feel right to your family, including chosen family. Share only details you are comfortable putting in a gift. Private addresses, sensitive medical information and other identifying details are not needed to make a meaningful song." },
    ],
    prompt: "I want to thank my grandfather, whom we call Pops. Every Friday he taught me to cook in his tiny kitchen and let me choose the music. When I moved away, he wrote the recipes on cards and mailed them to me. This song is from his granddaughter, about carrying a little of his kindness into my own home.",
    mood: "Warm and heartfelt can suit a thank-you, while joyful and bright works for a family celebration. Choose one main feeling and a music direction the recipient enjoys. You do not have to fit every family memory into a single song.",
    question: "Can the song be from several family members?",
    answer: "Yes. Explain that the message is from the family and identify the recipient in your story. Review the lyrics to check that names, relationships and words such as “we” match what you want to say before creating the music.",
    gifting: { heading: "Add the story behind the song", detail: "Give the downloaded audio with a short note about why you chose that memory. If family members live far apart, share the file privately so each person can listen. Your songforalways song page belongs to your account, so send the audio rather than your sign-in details." },
  },
  pet: {
    name: "Pet",
    title: "Personalized Pet Songs and Tributes | songforalways",
    description: "Turn your pet's little habits and shared adventures into a personalized song. Explore joyful pet song ideas or a gentle tribute, then review the lyrics.",
    heading: "A pet song for a very particular kind of best friend.",
    introduction: "The companion waiting by the door has a story too. Perhaps it is a dog who insists on the longest walk, a cat who steals the warm chair, or a small animal with a surprisingly big personality. A personalized pet song can celebrate those happy routines or gently remember a companion you miss. Tell the story in the way that feels right for you.",
    ideas: [
      { heading: "Start with a personality, not just a name", detail: "Mention a favorite toy, an unusual greeting or a habit you can recognize from another room. Describe what happens instead of only saying your pet is playful or loyal. Those small scenes help the song feel like your particular companion." },
      { heading: "Describe life together", detail: "Think about the first day at home, a regular walking route or the quiet moments on the sofa. Choose one memory and explain why it matters. You can write from your own perspective without pretending to know what your pet would say." },
      { heading: "Say whether this is a celebration or a remembrance", detail: "If the song is for an adoption anniversary or birthday, make that clear. If your companion has died, explain the tone you want and any details you prefer to leave out. There is no need to include the circumstances of their death." },
    ],
    prompt: "Our dog Milo has been with us for five years. He carries his blue tennis ball to the door every morning and refuses to leave the park until we walk past the ducks. He helped make a new city feel like home. I want a bright, affectionate song about our everyday adventures, from his humans to him.",
    mood: "Joyful and bright can match a playful tribute; nostalgic and gentle can suit a quieter remembrance. Describe the tone you want in your story, including whether humor belongs in the lyrics. The recording uses AI-generated vocals; it does not recreate your pet's sounds.",
    question: "Can I make a song for a pet who has died?",
    answer: "Yes. Share a memory you want to keep and say that the song is a tribute. You can review the words and remove anything that does not feel right before starting the music. The memorial song guide offers more ideas for a gentle remembrance.",
    gifting: { heading: "Keep a little piece of your time together", detail: "Save the downloaded audio alongside favorite photographs, or give it privately to someone who shared those daily routines. For a memorial gift, check that the recipient would welcome a song and let them choose when to listen. You do not need to make the tribute public." },
  },
  memorial: {
    name: "Memorial",
    title: "Personalized Memorial Song for a Loved One | songforalways",
    description: "Create a gentle memorial song from a loved one's stories and everyday kindness. Find remembrance prompts and review the lyrics at your own pace.",
    heading: "A memorial song for the stories you want to keep close.",
    introduction: "A remembrance can begin with something small: a familiar greeting, a shared place, or a lesson that stays with you. You do not need to sum up an entire life or find the perfect words. A personal memorial song offers one way to hold a memory, whether you make it for yourself or for someone who would welcome the gift.",
    ideas: [
      { heading: "Choose a memory that feels safe to revisit", detail: "It might be a walk you took, a meal you shared or a phrase that always made you smile. Describe the setting and what you remember feeling. You can leave out painful events, private family matters and the circumstances of a death." },
      { heading: "Say what they brought into your life", detail: "Think about a quality you experienced through an action: someone who always made room at the table or encouraged you to try again. A concrete memory gives the lyrics a way to express gratitude without needing to explain everything." },
      { heading: "Choose the words and beliefs that fit", detail: "Tell us whether you want a reflective, grateful or hopeful tone. If religious language or ideas about an afterlife are important, explain them in your own words; if they are not, say so. Check the draft carefully for wording that does not reflect your wishes." },
    ],
    prompt: "I want to remember my aunt, who taught me to notice the birds on our morning walks. She always carried an extra scarf because someone would forget theirs. I would like a gentle song about her everyday kindness and the things she taught me to see. Please keep it grounded in these memories, without religious language.",
    lyricExample: {
      lines: ["You carried one more scarf than you would wear", "And taught me which birds sang before the dawn", "I still walk slowly when I pass that tree", "And leave a little time to hear the song"],
    },
    reading: [{ href: "/guides/review-lyrics-before-music", label: "Review the words of your tribute" }],
    mood: "Choose nostalgic and gentle for a reflective song, and describe a quieter tone in your story if that feels right. A brighter feeling may fit someone remembered for laughter. There is no required way for a memorial to sound; take time with the lyrics and continue only when the words feel appropriate to you.",
    question: "Will the song recreate my loved one's voice?",
    answer: "No. songforalways creates an AI-generated song from the written memories you share. It does not clone a person's voice or turn a recording of them into new speech. Review the lyrics as a new tribute inspired by your memories.",
    gifting: { heading: "Leave room for their own listening moment", detail: "If the song is for someone else, ask whether they would welcome it before giving the finished audio. A private file and a simple note let them decide when to listen. Download and keep a backup; if you plan to use it during a service or at a venue, check permissions and playback arrangements beforehand." },
  },
};

export const occasionSlugs = Object.keys(occasions);

export function getOccasion(slug: string): Occasion | undefined {
  return Object.hasOwn(occasions, slug) ? occasions[slug] : undefined;
}
