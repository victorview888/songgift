type Occasion = {
  name: string;
  title: string;
  description: string;
  heading: string;
  introduction: string;
  ideas: { heading: string; detail: string }[];
  prompt: string;
  mood: string;
  question: string;
  answer: string;
  gifting: { heading: string; detail: string };
};

export const occasions: Record<string, Occasion> = {
  birthday: {
    name: "Birthday",
    title: "Personalized Birthday Song Gift | SongGift",
    description: "Make a personalized birthday song from the memories, habits, and hopes that make someone special. Review the lyrics before creating the music.",
    heading: "A birthday song that sounds like their story.",
    introduction: "A birthday is a chance to say more than “happy birthday.” Think about the little things they do, the moments you laugh about together, and what you hope the next year brings. Those details give a personalized birthday song a voice that a greeting card cannot.",
    ideas: [
      { heading: "A detail only you would know", detail: "Mention a nickname, a favorite place, or the way they turn an ordinary day around. One specific image can say more than a list of compliments." },
      { heading: "A memory with a beginning", detail: "Recall a trip, a celebration, or a quiet conversation. Share what happened and why it stayed with you, so the lyrics have a real scene to draw from." },
      { heading: "A wish for the year ahead", detail: "Tell them what you admire and what you hope they get to experience next. This gives the song a closing thought that feels like a gift." },
    ],
    prompt: "It's my sister's birthday. She always sings in the kitchen, even on hard mornings. Last summer we got lost on a road trip and ended up watching the sunset by a lake. I want her to know how much lighter she makes our family feel, and that I hope this year brings her the adventures she keeps planning.",
    mood: "Choose joyful and bright for a celebration, or warm and heartfelt if you want the song to feel like a personal letter. You can also choose a music direction such as acoustic pop or piano ballad.",
    question: "Do I need to write the lyrics myself?",
    answer: "No. Tell us the story in your own words. You can read and edit the generated lyrics before deciding whether to pay for the finished song.",
    gifting: { heading: "Give them a moment to listen", detail: "Download the finished audio before the birthday and test it on the device you plan to use. Pair it with a short note about the memory behind the song, or send the audio privately so they can listen in their own time. Share the downloaded file, rather than your signed-in SongGift account page." },
  },
  wedding: {
    name: "Wedding",
    title: "Personalized Wedding Song from Your Love Story | SongGift",
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
    title: "Personalized Anniversary Song Gift | SongGift",
    description: "Celebrate the years you have shared with a personalized anniversary song. Turn your favorite memories and everyday traditions into lyrics you can review.",
    heading: "An anniversary song for everything you have built together.",
    introduction: "An anniversary marks more than a date. It is a collection of places, changes, inside jokes, and ordinary days you chose to share. A personalized song can bring those memories into one thoughtful gift, whether you are celebrating your first year or many years together.",
    ideas: [
      { heading: "Begin with a shared place", detail: "It could be where you met, your first home, or the table you return to every year. A familiar setting helps the lyrics feel grounded in your life." },
      { heading: "Remember what changed", detail: "Mention a challenge you faced, a new beginning, or something you learned about each other. The years in between matter as much as the day you met." },
      { heading: "Keep an everyday tradition", detail: "Maybe you make coffee for each other, take the same walk, or never finish a film without talking through it. Small routines often carry the most affection." },
    ],
    prompt: "This is our tenth anniversary. We moved twice, adopted a dog, and still make pancakes together every Sunday. The first apartment had a tiny balcony where we watched thunderstorms. I want a warm, nostalgic song about how our life changed while the feeling of being a team stayed the same.",
    mood: "Nostalgic and gentle can suit a reflective gift; warm and heartfelt gives it the feeling of a letter. If your memories are full of laughter, a brighter direction may fit better.",
    question: "What if I only have a few details to share?",
    answer: "A few specific memories are enough to begin. Include who the song is for, one moment you both remember, and what you want them to hear now. You can refine the lyrics afterward.",
    gifting: { heading: "Let the memory lead the gift", detail: "Play the downloaded song during a quiet evening together, or send the audio with a photograph from the place mentioned in the lyrics. Read through names, dates and the anniversary number before starting the music. The finished recording reflects the lyrics used when generation begins." },
  },
  family: {
    name: "Family",
    title: "Personalized Family Song Gifts | SongGift",
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
    gifting: { heading: "Add the story behind the song", detail: "Give the downloaded audio with a short note about why you chose that memory. If family members live far apart, share the file privately so each person can listen. Your SongGift song page belongs to your account, so send the audio rather than your sign-in details." },
  },
  pet: {
    name: "Pet",
    title: "Personalized Pet Songs and Tributes | SongGift",
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
    title: "Personalized Memorial Songs from Your Memories | SongGift",
    description: "Create a gentle memorial song from a loved one's stories and everyday kindness. Find remembrance prompts and review the lyrics at your own pace.",
    heading: "A memorial song for the stories you want to keep close.",
    introduction: "A remembrance can begin with something small: a familiar greeting, a shared place, or a lesson that stays with you. You do not need to sum up an entire life or find the perfect words. A personal memorial song offers one way to hold a memory, whether you make it for yourself or for someone who would welcome the gift.",
    ideas: [
      { heading: "Choose a memory that feels safe to revisit", detail: "It might be a walk you took, a meal you shared or a phrase that always made you smile. Describe the setting and what you remember feeling. You can leave out painful events, private family matters and the circumstances of a death." },
      { heading: "Say what they brought into your life", detail: "Think about a quality you experienced through an action: someone who always made room at the table or encouraged you to try again. A concrete memory gives the lyrics a way to express gratitude without needing to explain everything." },
      { heading: "Choose the words and beliefs that fit", detail: "Tell us whether you want a reflective, grateful or hopeful tone. If religious language or ideas about an afterlife are important, explain them in your own words; if they are not, say so. Check the draft carefully for wording that does not reflect your wishes." },
    ],
    prompt: "I want to remember my aunt, who taught me to notice the birds on our morning walks. She always carried an extra scarf because someone would forget theirs. I would like a gentle song about her everyday kindness and the things she taught me to see. Please keep it grounded in these memories, without religious language.",
    mood: "Choose nostalgic and gentle for a reflective song, and describe a quieter tone in your story if that feels right. A brighter feeling may fit someone remembered for laughter. There is no required way for a memorial to sound; take time with the lyrics and continue only when the words feel appropriate to you.",
    question: "Will the song recreate my loved one's voice?",
    answer: "No. SongGift creates an AI-generated song from the written memories you share. It does not clone a person's voice or turn a recording of them into new speech. Review the lyrics as a new tribute inspired by your memories.",
    gifting: { heading: "Leave room for their own listening moment", detail: "If the song is for someone else, ask whether they would welcome it before giving the finished audio. A private file and a simple note let them decide when to listen. Download and keep a backup; if you plan to use it during a service or at a venue, check permissions and playback arrangements beforehand." },
  },
};

export const occasionSlugs = Object.keys(occasions);

export function getOccasion(slug: string): Occasion | undefined {
  return Object.hasOwn(occasions, slug) ? occasions[slug] : undefined;
}
