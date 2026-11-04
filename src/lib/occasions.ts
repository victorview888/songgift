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
  },
};

export const occasionSlugs = Object.keys(occasions);
