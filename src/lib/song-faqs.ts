export type SongFaq = {
  id: string;
  question: string;
  answer: string;
  links?: { label: string; href: string }[];
  home?: boolean;
};

export type SongFaqGroup = { id: string; title: string; items: SongFaq[] };

// Public answers shared by the homepage and Help. Prices and preview availability
// come from the same server settings used by the pricing and checkout pages.
export function songFaqGroups({ price, hasPreview }: { price: string; hasPreview: boolean }): SongFaqGroup[] {
  return [
    {
      id: "getting-started", title: "Making it personal", items: [
        {
          id: "how-it-works", question: "How does my story become a song?",
          answer: "Tell us who the song is for, share a few memories, and choose a mood and music style. We use AI to create the lyrics, vocals and music. Read and edit your free lyric draft first, then choose when to start a recording. A paid song includes the complete recording, account playback, an audio download and private gift sharing.",
          links: [{ label: "Start with your story", href: "/create" }],
        },
        {
          id: "story-details", question: "What should I write if I am not a songwriter?",
          answer: "A short, natural paragraph is enough to begin. Include their name, how you know each other, one memory, a little habit or favourite phrase, and what you want the song to say. Check the spelling of names and key phrases in the lyric draft before starting the music. Share only details you have permission to use, and leave out sensitive personal information.",
          links: [{ label: "Ideas for your story", href: "/guides/turn-memories-into-a-song" }],
        },
        {
          id: "occasions", question: "Which occasions can I make a song for?", home: false,
          answer: "Start with a birthday, wedding, anniversary, thank-you or just-because gift. You can also celebrate family or a pet, remember someone you miss, or make a song for Christmas, Christmas Eve or New Year. The details you share make the song personal to the recipient.",
          links: [{ label: "Explore song occasions", href: "/occasions" }],
        },
        {
          id: "music-style", question: "Can I choose the mood, style or singer?",
          answer: "Choose from the moods and music styles in the story form, including warm acoustic pop, a soft piano ballad, indie folk, uplifting pop and country-inspired music. The vocals and arrangement are AI-generated and can vary. Singer selection and voice cloning are not offered; use your story to describe the overall feeling you want.",
          links: [{ label: "Listen to sample songs", href: "/#samples" }],
        },
      ],
    },
    {
      id: "preview-payment", title: "Lyrics, previews & payment", items: [
        {
          id: "lyric-edits", question: "Can I change the lyrics before the music is made?",
          answer: "Yes. Read, edit and save the lyric draft before starting an audio preview or a paid recording. This is the time to check names, memories and the message in the chorus. Once a recording starts, its approved lyrics are locked. Changing words or music afterwards requires a separate recording; an unlimited supply of free remakes is not included.",
          links: [{ label: "Lyric review checklist", href: "/guides/review-lyrics-before-music" }],
        },
        {
          id: "free-preview", question: "What can I try before paying?",
          answer: hasPreview
            ? "You can read and edit your lyric draft for free. Where available, each account with a verified email also has one free audio creation in total, with up to 60 seconds to listen to. This is not a daily allowance; replaying the same excerpt does not use another one. Your order shows availability. If you buy that song, payment unlocks the same full recording and its download, rather than creating a different version."
            : "You can read, edit and save your lyric draft for free before paying to start the complete recording. Listen to the public sample songs for examples of the service. A free personal audio preview is not currently offered; check your order page for any available offer before purchasing.",
          links: [{ label: "Preview and payment details", href: "/pricing" }],
        },
        {
          id: "song-price", question: "How much is a song, and is there a subscription?",
          answer: `The standard public price is US$${price} for one complete AI-generated vocal song, with playback, audio download and private gift sharing. It is a one-time purchase, with no subscription or credit top-up. Checkout uses US dollars and PayPal. Your order's confirmed quote or account-specific offer is shown before payment; review it along with any payment-provider conversion fees.`,
          links: [{ label: "Full pricing and what is included", href: "/pricing" }],
        },
        {
          id: "payment-methods", question: "Which payment methods and currencies can I use?", home: false,
          answer: "The current checkout uses PayPal and charges in US dollars (USD). Available funding sources depend on PayPal's rules for your account and region. Your bank or payment provider may apply its own conversion or payment fees. If a payment is declined, check the message in PayPal before trying again; local-currency checkout and other payment methods are not currently offered.",
          links: [{ label: "Payment options", href: "/pricing" }],
        },
      ],
    },
    {
      id: "delivery-sharing", title: "Keeping & giving your song", items: [
        {
          id: "delivery-time", question: "When will my song be ready, and where do I find it?",
          answer: "Follow the saved order in My Songs after starting a recording. Processing time varies with demand and service availability, so allow extra time before an occasion. You can leave and return with the same account to check progress, play the finished song and download it. The 60-second limit applies to an unpaid preview excerpt, not to the complete purchased recording; the finished player's duration shows your song's actual length.",
          links: [{ label: "Find your song", href: "/my-songs" }, { label: "Delivery help", href: "/help#delivery" }],
        },
        {
          id: "audio-download", question: "Can I download my song, and how long is it kept?",
          answer: "Yes. Use Download on the completed song page or in My Songs, and keep a backup for yourself. We currently keep purchased audio long term, with no scheduled expiry. If a playback or download link expires, reopen the song from your account to get a fresh link. Download and test a copy ahead of an event.",
          links: [{ label: "Audio storage details", href: "/policies/audio-storage" }],
        },
        {
          id: "give-a-song", question: "How can I give the song without sharing my account?",
          answer: "Open the completed song and choose Create gift link, add an optional greeting, and confirm permission to share. The recipient can listen through that link without signing in to your account. Sharing starts switched off, and you can replace or disable a link later. Anyone with an active link can forward it, so share thoughtfully. You can also send the downloaded audio file.",
          links: [{ label: "Gift-sharing guide", href: "/guides/give-a-personal-song-gift" }],
        },
        {
          id: "order-problems", question: "What if my song has a problem or I need a refund?",
          answer: "For missing or unplayable audio, a duplicate charge, or a paid order that has not arrived, contact support with the order reference and relevant receipt. Keep the existing order rather than paying again to fix it. We check the payment and delivery evidence to decide the appropriate remedy. Refunds are assessed individually; submitting a request does not mean a refund has been issued. Your mandatory consumer rights remain unaffected.",
          links: [{ label: "Contact support", href: "/contact" }, { label: "Payment and refund information", href: "/policies/refunds" }],
        },
      ],
    },
    {
      id: "privacy-rights", title: "Privacy & using your song", items: [
        {
          id: "story-privacy", question: "Will my story or song be made public?",
          answer: "Your order pages require sign-in, and gift sharing is switched off until you enable it. Submitting a story does not give us permission to publish it or use your private song in advertising; promotional use needs separate permission. Your story, recipient details and lyrics are processed by AI services to make the song. Include only information you have permission to share, and treat an enabled gift link as access for anyone who receives it.",
          links: [{ label: "Privacy Policy", href: "/policies/privacy" }],
        },
        {
          id: "song-rights", question: "Can I use my song commercially or claim exclusive copyright?",
          answer: "The purchase covers personal listening, downloading and gifting, subject to our terms and permissions for material you provide. Contact us before purchasing for commercial distribution, advertising or monetised content so the proposed use and permissions can be checked. Buying an AI-generated song does not by itself guarantee exclusive copyright or clear every possible third-party right.",
          links: [{ label: "Song-use terms", href: "/policies/terms" }, { label: "Ask about your intended use", href: "/contact" }],
        },
      ],
    },
  ];
}
