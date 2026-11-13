export type Guide = {
  slug: string;
  title: string;
  description: string;
  category: string;
  minutes: number;
  sections: { title: string; paragraphs: string[] }[];
  faq: { q: string; a: string }[];
  occasion: string;
};
export const guides: Guide[] = [
  {
    slug: "turn-memories-into-a-song",
    title: "How to turn a real memory into a personal song",
    description:
      "Choose details, shape a short story and prepare a useful brief for your song gift.",
    category: "Writing your story",
    minutes: 5,
    occasion: "birthday",
    sections: [
      {
        title: "Choose one feeling to leave behind",
        paragraphs: [
          "Before listing achievements or dates, decide what the listener should feel: appreciated, reassured, celebrated or remembered. That choice gives the song a direction. A birthday story can be joyful without becoming a list of compliments; a thank-you can be quiet and specific.",
          "Write one plain sentence: “I want my sister to know how much her steady support means.” You can return to that sentence when deciding which memories belong. There is no need to make the whole story rhyme. The story form is a brief for the lyrics, not the finished performance.",
        ],
      },
      {
        title: "Pick a scene you can actually describe",
        paragraphs: [
          "A small scene often does more than a large claim. Describe a place, a habit and an action: the train station where you met, the tea someone made after a long shift, or a joke that still makes you both laugh. Include what happened and why you remember it.",
          "For example, instead of “You have always been there for me,” try “You waited at the kitchen table with tea when I came home after every late shift.” Replace this example with a memory of your own.",
        ],
      },
      {
        title: "Separate essential facts from optional atmosphere",
        paragraphs: [
          "Mark the details you want to check in the lyrics: the recipient’s name, your relationship, a relevant date and the main message. Keep chronology clear and explain unfamiliar nicknames. If a detail matters only to you, a brief explanation helps it become understandable in a verse.",
          "Leave out addresses, private account information and facts the recipient would not want shared. When mentioning someone else, consider whether you have permission. A warm song does not need identifying details about everyone in a family.",
        ],
      },
      {
        title: "Match the musical mood to the memory",
        paragraphs: [
          "Describe the mood in ordinary words such as warm, gentle, upbeat or reflective. A style preference can guide the arrangement, but it does not guarantee a particular artist’s voice or an exact musical result. Avoid requests to impersonate a real singer.",
          "Read the generated lyrics before paying for music. Check that the story is accurate, the point of view is consistent and the chorus says what you mean. Keep a copy of any important edits and use Save lyrics before creating the song.",
        ],
      },
      {
        title: "A short brief you can adapt",
        paragraphs: [
          "Try this structure: “This song is for [name], my [relationship], for [occasion]. I remember [one specific scene]. A little thing I love is [habit or phrase]. I want them to hear [main message]. The mood should feel [mood], with [style preference].” Fill it with your own words rather than inventing milestones.",
          "After the song is finished, listen from beginning to end and download a backup. Choose a moment when the recipient can actually hear it. A simple private listening moment can be more comfortable than an unexpected public performance.",
        ],
      },
    ],
    faq: [
      {
        q: "How long should my story be?",
        a: "Include enough context to explain a few real details. SongGift accepts 20–8,000 characters; a focused brief is usually easier to review than an entire life history.",
      },
      {
        q: "Do I need to write rhyming lyrics?",
        a: "No. Describe the memory naturally, then review and edit the generated lyrics before music creation.",
      },
      {
        q: "Can I include a surprise or a sensitive memory?",
        a: "Consider the recipient’s comfort and permission. Leave out identifying or sensitive details that do not need to become part of a song.",
      },
    ],
  },
  {
    slug: "review-lyrics-before-music",
    title: "What to check before turning lyrics into music",
    description:
      "A practical checklist for names, story details, point of view and singable lines before checkout.",
    category: "Review and preparation",
    minutes: 5,
    occasion: "anniversary",
    sections: [
      {
        title: "Start with facts before polishing the language",
        paragraphs: [
          "Read the lyrics once without judging the rhyme. Check names, relationships, places, dates and who is speaking. A line may sound pleasing while changing an important fact. Correct those details before choosing a more poetic expression.",
          "If a memory involves several people, make sure pronouns still point to the right person. A verse written from a parent’s perspective should not quietly become a verse narrated by a partner. Keep the viewpoint clear all the way through the chorus.",
        ],
      },
      {
        title: "Read every line aloud",
        paragraphs: [
          "Spoken reading helps you notice a line that is crowded or awkward. Break up long lists and remove words that exist only to force a rhyme. Natural wording gives the musical interpretation a clearer starting point.",
          "Say the recipient’s name aloud in context. Uncommon names and nicknames may be pronounced differently by an AI model. A spelling note can help explain your intention, but exact pronunciation and word-for-word singing are not guaranteed. Make any essential name checks again when you hear the audio.",
        ],
      },
      {
        title: "Check the chorus as a message on its own",
        paragraphs: [
          "The chorus should carry the main feeling. Ask whether the recipient would understand the message without knowing every scene in the verses. A simple phrase of thanks or a clear promise can be more effective than another detailed anecdote.",
          "Avoid promising things you do not mean just because the line fits a rhyme. For an anniversary, choose language that sounds like your relationship. For a memorial, keep the wording respectful and leave room for the listener’s feelings.",
        ],
      },
      {
        title: "Confirm the version before checkout",
        paragraphs: [
          "Save the edited lyrics and wait for the success message. Music generation uses the confirmed song input; editing words after a music task has started does not rewrite an already submitted performance. An additional song or remake is not automatically included in a single purchase.",
          "Review the price and the payment details shown for your order. A browser return from a payment page is not by itself proof of payment: the service checks the payment provider’s result. If something looks unclear, open your existing order rather than repeatedly creating a new checkout.",
        ],
      },
      {
        title: "Review the finished song separately",
        paragraphs: [
          "Written lyrics and generated audio are different things to check. Once the audio is ready, listen for the name, the main message, language, overall style and whether the song plays from beginning to end. Test the downloaded file as well as the player.",
          "If you need help, keep the order reference and explain the specific issue. Do not paste payment passwords or full card details into a support message. Refund and remedy requests are reviewed under the published policy; this checklist does not promise a free remake or automatic refund.",
        ],
      },
    ],
    faq: [
      {
        q: "Does Save lyrics create the audio?",
        a: "No. It saves the confirmed text. Music creation is a separate step after payment requirements are satisfied.",
      },
      {
        q: "Can I change a song after music generation starts?",
        a: "Changing text does not change a task already submitted. Contact support about your existing order before requesting another song.",
      },
      {
        q: "Are exact pronunciation and singing guaranteed?",
        a: "No. AI musical interpretation varies, so review the actual audio when it is delivered.",
      },
    ],
  },
  {
    slug: "give-a-personal-song-gift",
    title: "How to give a personal song as a thoughtful gift",
    description:
      "Plan the listening moment, use a private gift link and keep a backup of the finished audio.",
    category: "Giving your song",
    minutes: 4,
    occasion: "wedding",
    sections: [
      {
        title: "Plan the listening moment",
        paragraphs: [
          "Think about where and how the recipient will hear the song. A quiet room, a walk with headphones or a small gathering can each feel right for a different relationship. Ask whether the person enjoys public surprises before playing a personal song in front of other people.",
          "For a wedding or another scheduled event, test the playback setup beforehand and keep a local copy. An internet connection or a venue’s sound system can fail. Do not rely on a link alone for a moment that cannot easily be repeated.",
        ],
      },
      {
        title: "Use the finished audio, not a writing draft",
        paragraphs: [
          "Listen to the completed song yourself before giving it. Review the names, story, musical mood and the start and end of the recording. A lyric preview helps with writing; it is not the same as checking the finished audio.",
          "Give yourself room to handle an issue before an event. Song generation time and output can vary. Avoid making a promise about an exact delivery minute or a particular vocal performance when planning a surprise.",
        ],
      },
      {
        title: "Share only what the recipient needs",
        paragraphs: [
          "SongGift gift sharing is off until the buyer enables it for a finished song. A separate gift link lets someone listen without using the buyer’s account. The gift page shows the selected song, the recipient’s name and an optional short greeting, rather than the private order, original story or payment information.",
          "Anyone who receives the link may be able to listen and forward it. Send it through a channel you trust. If you replace or turn off a gift link, new playback requests through the old link stop; a recording already buffered or saved cannot be taken back.",
        ],
      },
      {
        title: "Add a short note, then let the song speak",
        paragraphs: [
          "A greeting can explain why you made the song: “For all the ordinary days you made better.” There is no need to retell the entire story in the message. Keep the note suitable for anyone who may receive the link.",
          "If a song touches on grief or a private experience, give the recipient a choice about when to listen. A thoughtful gift includes space for a response, including a response that comes later.",
        ],
      },
      {
        title: "Keep a backup and respect the setting",
        paragraphs: [
          "Download a copy of the finished audio to your own device. SongGift currently plans long-term audio storage without a scheduled expiry, but keeping your own backup is still sensible. Future access can depend on account and service availability.",
          "A song purchase is for the uses described in the published terms. If you want to put it in an advertisement, distribute it commercially or use it in another public production, check the relevant rights and provider terms first. A gift purchase is not a blanket guarantee of exclusive copyright or commercial clearance.",
        ],
      },
    ],
    faq: [
      {
        q: "Does the recipient need my account?",
        a: "No. An active gift link provides a separate listening page. Never share your login code or account session.",
      },
      {
        q: "Can I turn a gift link off?",
        a: "Yes. The buyer can turn sharing off or replace the link. Audio already received or saved cannot be recalled.",
      },
      {
        q: "Can I use the song during an event?",
        a: "Test the audio and venue setup, keep a local backup and check any rights or permissions needed for your particular use.",
      },
    ],
  },
];
export const guideBySlug = (slug: string) =>
  guides.find((guide) => guide.slug === slug);
