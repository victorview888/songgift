export type PolicyBlock = { kind: "paragraph"; text: string } | { kind: "list"; items: string[] } | { kind: "links"; links: { label: string; href: string }[] };
export type PolicyDocument = { title: string; description: string; effectiveDate?: string; sections: { title: string; blocks: PolicyBlock[] }[] };

export const legalDetails = { operator: "明日逻辑", location: "Shanghai, China", email: "support@songforalways.com" } as const;

export const legalDocuments: Record<"terms" | "privacy" | "content-standards", PolicyDocument> = {
  "terms": {
    "title": "Terms of Service",
    "description": "How SongGift accounts, personalised song orders, payments and delivery work.",
    "effectiveDate": "2026-11-10",
    "sections": [
      {
        "title": "1. About SongGift and these terms",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "SongGift, available at https://www.songforalways.com, helps you turn a story and your preferences into AI-generated lyrics and a personalised song. In these terms, “we”, “us” and “our” refer to 明日逻辑, operating SongGift from Shanghai, China."
          },
          {
            "kind": "paragraph",
            "text": "These terms cover your account, song orders and use of the service. Please read them before creating an account or placing an order. Our Privacy Policy explains how we handle personal information. The payment and audio-storage guidance linked from the website provides further information about those parts of the service."
          },
          {
            "kind": "paragraph",
            "text": "Nothing in these terms limits consumer or privacy rights that applicable law does not allow us to exclude."
          }
        ]
      },
      {
        "title": "2. Eligibility and account security",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "You must be at least 18 years old and have reached the age of legal majority where you live to create an account, submit a story or purchase a song. This requirement also reflects the eligibility rules of our current music-generation provider."
          },
          {
            "kind": "paragraph",
            "text": "Use an email address you control. Keep your email account, sign-in codes and sign-in links secure. Give the recipient a downloaded song rather than your sign-in credentials. Let us know if you believe someone has accessed your account without permission."
          }
        ]
      },
      {
        "title": "3. Creating and approving your song",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "You provide the recipient’s name, occasion, story and musical preferences. You can review and edit the generated lyrics before proceeding to payment and music generation. The lyric preview is a text preview; it is not a recording of the finished music."
          },
          {
            "kind": "paragraph",
            "text": "Check names, dates, facts and wording carefully. Starting music generation uses the approved content and settings for that attempt. Editing another draft later does not change audio already being generated or a finished recording."
          },
          {
            "kind": "paragraph",
            "text": "Lyrics, vocals and music are produced using AI. Pronunciation, wording, arrangement, voice and duration can vary, and an AI system can make mistakes. Similar output may be produced for other users. If the delivered song has a problem, use the support process described below."
          }
        ]
      },
      {
        "title": "4. Prices and payment",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "The amount and currency for your order are shown before you authorise payment. SongGift currently sells individual song orders. A single-song purchase does not create a recurring subscription."
          },
          {
            "kind": "links",
            "links": [
              {
                "label": "Current pricing and included services",
                "href": "/pricing"
              }
            ]
          },
          {
            "kind": "paragraph",
            "text": "Payment is handled by the payment provider offered at checkout. That provider may apply its own account eligibility rules, currency conversion or other charges, which it explains separately. Returning from a checkout page does not by itself confirm successful payment; SongGift must verify the payment before authorising paid generation."
          },
          {
            "kind": "paragraph",
            "text": "If your provider shows a charge but the order appears unpaid, retain the receipt and contact us with the SongGift order reference. Avoid making a second purchase to resolve the first payment."
          }
        ]
      },
      {
        "title": "5. Content you submit",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "You retain any rights you already hold in the stories, text and other material you submit. Submit only content you are entitled to use and share for this purpose. Obtain any permissions needed from people whose information you include."
          },
          {
            "kind": "paragraph",
            "text": "Give us and the service providers involved the permission needed to process that content to write lyrics, generate music, save and deliver your order, and investigate related support or security issues. Our Privacy Policy describes the information sent to those providers and their roles."
          },
          {
            "kind": "paragraph",
            "text": "Keep the story focused on details needed for the song. Do not include passwords, identity-document numbers, financial credentials or sensitive private information. Do not request unlawful content, harassment, impersonation, unauthorised copying of existing lyrics or imitation that infringes another person’s rights."
          },
          {
            "kind": "paragraph",
            "text": "Submitting a story does not give SongGift permission to publish it or use your private song as an advertisement. Any promotional use would require separate permission."
          }
        ]
      },
      {
        "title": "6. Using the delivered song",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Once paid for and delivered, you may download, keep, listen to and give the song to its intended recipient for personal use, to the extent we hold the rights needed to permit those uses. You remain responsible for permissions relating to material you supplied and for how you subsequently publish or use the recording."
          },
          {
            "kind": "paragraph",
            "text": "AI-generated material may have limited or different copyright protection depending on the country and the human contribution involved. A song purchase does not by itself guarantee exclusive copyright, copyright registration, or clearance of every possible third-party right."
          },
          {
            "kind": "paragraph",
            "text": "If you intend to distribute, monetise or otherwise use the song commercially, contact us before purchasing so that the applicable model licence and proposed use can be checked. Any additional commercial-use permission must be expressly agreed. AI-origin labels or watermarks may be included in the recording; do not remove them where doing so would breach applicable law or licence conditions."
          }
        ]
      },
      {
        "title": "7. Delivery, access and storage",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Finished audio is available through the account associated with the order. Open My Songs to check progress, listen or download. Generation and saving depend on external services; any time estimate is an estimate unless an express delivery commitment is stated for your purchase."
          },
          {
            "kind": "paragraph",
            "text": "We currently retain purchased songs long term, with no scheduled expiry for finished audio. Download your song and keep your own backup, particularly before the occasion for which it is intended. Long-term account storage is not a promise that the website will operate forever or that a file can never become unavailable."
          },
          {
            "kind": "paragraph",
            "text": "Playback and download links may expire for security reasons. Reopen the song from your account to obtain a fresh link. Treat an audio link as private: anyone holding a valid link may be able to access the file while it remains valid."
          },
          {
            "kind": "paragraph",
            "text": "Clearing a browser draft or signing out does not delete server-saved orders or purchased audio. Account deletion is a separate request and may affect access to stored songs. Download a backup before requesting deletion."
          }
        ]
      },
      {
        "title": "8. Payment, delivery and refund problems",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Contact us if you see a duplicate charge, a paid order that has not been delivered, or a problem such as missing or unplayable audio. Include the order reference, a description of the issue and the payment receipt where relevant. Do not send full card details or sign-in codes."
          },
          {
            "kind": "paragraph",
            "text": "We assess the payment and delivery evidence and the nature of the reported problem. The appropriate remedy may involve recovering the existing generation task, restoring the saved audio, correcting a delivery issue or considering a refund in accordance with the circumstances and applicable consumer law."
          },
          {
            "kind": "paragraph",
            "text": "A support request is not confirmation that a refund has been issued. Any approved refund should be checked against the payment provider’s actual transaction record. Refund requests are assessed individually and your mandatory consumer rights remain unaffected."
          }
        ]
      },
      {
        "title": "9. Responsible use and restrictions",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Do not attempt to access another customer’s orders, bypass payment or access controls, misuse sign-in messages, disrupt the service or introduce harmful code. Respect the rights of other people and the usage restrictions applicable to the AI services supporting your order."
          },
          {
            "kind": "paragraph",
            "text": "We may restrict activity where reasonably necessary to address a security incident, fraud, unlawful content or a material breach of these terms. Where appropriate, we will explain the restriction and provide a way to raise a concern. A restriction does not automatically remove rights relating to an existing paid order."
          },
          {
            "kind": "paragraph",
            "text": "Our Content Standards apply to stories, instructions, lyrics and generated music, including content you request, store or distribute through SongGift. They specify prohibited categories, reporting routes, review targets and possible actions."
          },
          {
            "kind": "links",
            "links": [
              {
                "label": "Content Standards and review process",
                "href": "/policies/content-standards"
              },
              {
                "label": "Report content or appeal a decision",
                "href": "/report"
              }
            ]
          }
        ]
      },
      {
        "title": "10. Service changes and responsibility",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "We may maintain, update or replace parts of SongGift and its supporting providers. Material changes affecting your purchases or access will be explained where required. A later change to these terms will not retroactively remove rights attached to an earlier purchase."
          },
          {
            "kind": "paragraph",
            "text": "We are responsible for the service as required by applicable law. Nothing here excludes responsibility for fraud, deliberate misconduct, or any liability that cannot lawfully be limited. AI and third-party service limitations do not remove mandatory consumer remedies."
          }
        ]
      },
      {
        "title": "11. Questions, disputes and updates",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Contact the operator at support@songforalways.com for questions or complaints. Please describe the issue and the outcome you are seeking so it can be investigated. Your statutory rights, including any right to bring a claim before an appropriate authority or court, remain available."
          },
          {
            "kind": "paragraph",
            "text": "These terms are subject to applicable law, including any mandatory protections available in your place of residence. They do not require you to waive access to a court or dispute-resolution body available to you by law."
          },
          {
            "kind": "paragraph",
            "text": "We display the effective date of these terms and will give notice of material revisions where required. For questions, contact support@songforalways.com."
          }
        ]
      }
    ]
  },
  "privacy": {
    "title": "Privacy Policy",
    "description": "How SongGift handles your account, stories, AI generation, payments and saved songs.",
    "effectiveDate": "2026-11-10",
    "sections": [
      {
        "title": "1. Who is responsible for your information",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "This policy describes personal information handled through SongGift at https://www.songforalways.com. 明日逻辑, operating SongGift from Shanghai, China, is responsible for deciding how SongGift uses that information. It covers website visitors, account holders and people whose information is included in song requests."
          },
          {
            "kind": "paragraph",
            "text": "Payment providers and other providers may also process information under their own policies. Their roles and the information shared with them are described below."
          }
        ]
      },
      {
        "title": "2. Information involved in using SongGift",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Account information: your email address, account identifier, email-verification and authentication records, and information needed to maintain your session."
          },
          {
            "kind": "paragraph",
            "text": "Story and song information: the recipient’s name, your relationship, the occasion, memories or story you enter, musical preferences, generated and edited lyrics, song title, generation status and finished audio. Information about another person can be personal information even if that person has no SongGift account."
          },
          {
            "kind": "paragraph",
            "text": "Order and payment records: order references, the quoted amount and currency, payment-provider order or transaction references, verified payment and refund amounts, timestamps and records needed to investigate discrepancies. Payment credentials are entered with the checkout provider. SongGift’s checkout does not ask you to submit your full card number or card security code to SongGift."
          },
          {
            "kind": "paragraph",
            "text": "Technical and security information: hosting and authentication services may process IP addresses, browser or device information, request timestamps, error records and service-operation logs. SongGift also maintains records of restricted administrative actions to help investigate access and order-handling issues."
          },
          {
            "kind": "paragraph",
            "text": "Support information: the email address, order reference, message and attachments you send when contacting support. The current contact form prepares an email draft in your browser; pressing “Prepare email” does not send it. You choose whether to send it using your email application, which has its own privacy practices."
          },
          {
            "kind": "paragraph",
            "text": "Content reports: the category, content link or reference, description and optional contact email you submit; the report receipt; and authorised reviewers’ decisions and notes. To limit spam we temporarily store a keyed hash derived from the connection IP and a time window, rather than storing the raw IP in the report-rate-limit table."
          }
        ]
      },
      {
        "title": "3. How and why we use information",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "We use the information needed to:"
          },
          {
            "kind": "list",
            "items": [
              "create and authenticate your account and keep each customer’s orders associated with the right account;",
              "restore an unfinished story, write and revise lyrics, generate music, and save and deliver your song;",
              "verify payments, record refunds and investigate duplicate or disputed transactions;",
              "answer support requests and, when enabled, send service messages about your order;",
              "operate and protect the website, diagnose failures, recover interrupted delivery and keep administrative handling accountable;",
              "meet applicable legal obligations and establish or defend legal claims."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Where data-protection law requires a legal basis, the basis depends on the activity: performing the service you request, complying with a legal obligation, pursuing a permitted and proportionate security or operational interest, or obtaining consent where it is required. Acceptance of general terms is not treated as blanket consent to marketing, advertising tracking or every use of someone else’s information."
          }
        ]
      },
      {
        "title": "4. AI processing of your story and lyrics",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "AI generation requires sending content outside SongGift’s own database:"
          },
          {
            "kind": "list",
            "items": [
              "DeepSeek: the lyric-writing request includes the recipient’s name, relationship, occasion, mood, musical style and story. SongGift does not deliberately include your account email in this prompt; an email address or other private detail you type into the story could nevertheless be sent as part of its text.",
              "fal.ai and its underlying music-model provider: the music request includes the approved lyrics, recipient’s name, story details, occasion and musical direction. The current configured model is Google’s Lyria 3 Pro through fal. A model provider may receive the content when fal forwards the request to its service."
            ]
          },
          {
            "kind": "paragraph",
            "text": "DeepSeek also checks submitted story details, generated lyrics and the final approved text for content-standard violations before we proceed. This includes lyrics edited by you. The checks do not require your account email to be included in their prompts."
          },
          {
            "kind": "paragraph",
            "text": "Only include information that is appropriate for this processing and that you are entitled to share. Use a nickname or omit an identifying detail where that serves your purpose. Avoid health information, financial details, government identifiers, exact private addresses and other sensitive information about yourself or another person."
          },
          {
            "kind": "paragraph",
            "text": "SongGift does not use your stories or songs to train its own AI models. External AI providers may have different rules about retention and model improvement. Provider processing, retention and any model-improvement use depend on the terms and settings applicable to the particular API and model. Review the linked provider information and contact us before submitting content if a particular restriction matters to you."
          },
          {
            "kind": "links",
            "links": [
              {
                "label": "DeepSeek privacy information",
                "href": "https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html"
              },
              {
                "label": "fal API terms",
                "href": "https://fal.ai/legal/api-services"
              },
              {
                "label": "fal privacy information",
                "href": "https://fal.ai/legal/privacy-policy"
              }
            ]
          },
          {
            "kind": "paragraph",
            "text": "A provider’s general consumer policy is not necessarily the complete contract governing its API."
          }
        ]
      },
      {
        "title": "5. Other providers and disclosures",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Supabase supports account authentication, the order database and stored song files. It receives the information needed for those functions, including account email, submitted and generated content, and order records."
          },
          {
            "kind": "paragraph",
            "text": "Cloudflare hosts and delivers the website and processes the network requests needed to operate and protect it. Requests may involve IP addresses, requested URLs and operational information."
          },
          {
            "kind": "paragraph",
            "text": "PayPal handles the checkout currently offered on the live site. We send the order reference, a general product description and the amount and currency. PayPal handles the information you provide on its own checkout and returns payment evidence needed to manage the order. If we introduce another payment provider, we will identify it here and at checkout."
          },
          {
            "kind": "paragraph",
            "text": "Email services send sign-in messages through the service configured for account authentication. If song-ready notifications are enabled, Resend receives the destination email, recipient name and account-protected song-page link used in that message. Enabling notifications does not make the audio publicly available."
          },
          {
            "kind": "paragraph",
            "text": "Authorised personnel may access information when needed to resolve an order, security or support issue. Account privacy controls do not mean that necessary service personnel and processing providers can never access data."
          },
          {
            "kind": "paragraph",
            "text": "We may disclose relevant records to satisfy a valid legal requirement or protect legal rights. We do not publish customer stories or songs as a consequence of ordering. A downloaded file you send to another person is shared at your direction."
          }
        ]
      },
      {
        "title": "6. Cookies and browser drafts",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "SongGift uses authentication cookies to keep you signed in and a short-lived cookie to return you to the page you intended to visit after signing in."
          },
          {
            "kind": "paragraph",
            "text": "The story form uses browser session storage to restore an unfinished draft in the same browser tab. The application treats a draft as restorable for up to 24 hours after its last save. This is a restoration window, not a guarantee that a browser physically erases every copy at exactly 24 hours. Closing or restoring tabs and clearing browser data are also governed by your browser."
          },
          {
            "kind": "paragraph",
            "text": "You can clear the local draft through the account page. Signing out clears that tab’s draft where the browser permits it. Clearing local storage does not delete orders already saved on the server. Disabling cookies or browser storage may prevent sign-in or draft restoration."
          },
          {
            "kind": "paragraph",
            "text": "We currently do not use advertising pixels or optional product-analytics tracking on the SongGift website. If we introduce optional tracking, we will explain its purposes and provide any choices required by applicable law before activating it. Third-party checkout pages have their own cookie notices."
          }
        ]
      },
      {
        "title": "7. Storage and retention",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "We keep information for the period needed for the purpose for which it was collected, subject to applicable legal requirements:"
          },
          {
            "kind": "list",
            "items": [
              "Account and saved-order information: maintained to provide account access, order history, delivery and support; retention following a deletion request depends on the request and any lawful reason to retain particular records.",
              "Purchased audio: currently kept long term with no scheduled expiry for finished files. Download and back up your song. An expiring playback link is separate from deletion of the stored file.",
              "Browser drafts: restorable in the same tab for up to 24 hours after the last save, as described above; server-saved orders are separate.",
              "Payment and audit records: retained where necessary for accounting, fraud prevention, disputes or legal obligations. A request to delete an account may not require immediate deletion of all transaction evidence.",
              "Support records and operational logs: kept as needed to handle the issue, maintain security and comply with applicable obligations."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Content-report contact details, descriptions and review records are retained as needed to investigate the report, respond to an appeal, document action or meet a legal obligation. Temporary report-rate-limit hashes are removed after their short anti-spam window, with expired windows cleared during later submissions. A reporter’s email is optional and is not treated as proof of account ownership."
          },
          {
            "kind": "paragraph",
            "text": "External providers may have separate retention periods for the information they process. Deletion from an active system does not necessarily mean immediate deletion from every backup. For a deletion request, we will explain any remaining retention requirements or backup limitations that apply."
          }
        ]
      },
      {
        "title": "8. Security and access to audio",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "The service uses authenticated access checks to associate private orders with their account, restricted administrative access and time-limited links for audio playback and downloads. HTTPS protects connections to the website. No storage or transmission method can guarantee perfect security."
          },
          {
            "kind": "paragraph",
            "text": "Keep your account secure and treat valid audio links as confidential. A person holding a valid signed link may be able to access its file until the link expires. Your account-protected song page is different from a freely shareable gift page."
          }
        ]
      },
      {
        "title": "9. International processing",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "SongGift is operated from Shanghai, China. Your information may be processed in China and other countries used by our hosting, database, AI and payment providers, including countries outside your place of residence. The location depends on the service used and the infrastructure supporting it."
          },
          {
            "kind": "paragraph",
            "text": "We handle international processing in accordance with applicable law. You may contact support@songforalways.com for questions about the providers involved in your order and the applicable safeguards or choices. This policy does not mean that submitting a story provides consent to every possible international transfer; separate consent will be requested where required."
          }
        ]
      },
      {
        "title": "10. Your choices and privacy requests",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Depending on applicable law, you may have rights to access, correct, receive a copy of or request deletion of your information, restrict or object to processing, withdraw consent where consent is used, and complain to the relevant data-protection authority."
          },
          {
            "kind": "paragraph",
            "text": "Send a request to support@songforalways.com. We may need to verify your connection to the account or information before acting, and we will explain applicable limitations. We will respond within the period required by applicable law. A recipient whose details appear in a story may also contact us about their information."
          },
          {
            "kind": "paragraph",
            "text": "Account settings currently provide sign-out and local-draft clearing; they do not provide automatic account deletion or a full data export. A privacy request is separate from those controls. Deleting information needed to operate an account or host a song may affect continued access, so download purchased audio before requesting deletion."
          }
        ]
      },
      {
        "title": "11. Children and information about recipients",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Account creation and song generation are intended for adults who are at least 18 and have reached the applicable age of majority. A song about a child does not make the child an account holder. Where you include information about a child, provide only appropriate, minimal details and obtain any required authority or guardian consent."
          },
          {
            "kind": "paragraph",
            "text": "If you believe a child has created an account or information about a child has been submitted improperly, contact us so that we can investigate and take the steps required by applicable law."
          }
        ]
      },
      {
        "title": "12. Contact and changes",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Questions and requests should be sent to support@songforalways.com. The data controller is 明日逻辑, operating SongGift from Shanghai, China. We display the effective date of this policy and will provide notice of material changes where required."
          }
        ]
      }
    ]
  },
  "content-standards": {
    "title": "Content Standards & Reporting",
    "description": "Rules for AI lyrics and songs, how to report a concern, and how SongGift reviews it.",
    "effectiveDate": "2026-11-10",
    "sections": [
      {
        "title": "1. Where these standards apply",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "These standards form part of the SongGift Terms of Service. They cover the story, names, instructions and preferences you submit, lyrics you generate or edit, and music or vocals created, stored or distributed through SongGift. Our service is for personal songs and respectful gifts. The same rules apply to attempts to bypass a safety check."
          },
          {
            "kind": "links",
            "links": [
              {
                "label": "Terms of Service",
                "href": "/policies/terms"
              }
            ]
          }
        ]
      },
      {
        "title": "2. Content we prohibit",
        "blocks": [
          {
            "kind": "list",
            "items": [
              "Pornography / NSFW: sexually explicit material, descriptions of sexual acts, fetish content, sexual exploitation, non-consensual intimate content or requests to create nudity or sexualised depictions.",
              "Violence / gore: graphic injury or cruelty, credible threats, instructions or encouragement for violence, terrorism, extremist recruitment, mass harm or weapons of mass destruction.",
              "Hate or discrimination: dehumanisation, targeted abuse, exclusion or incitement against people based on protected characteristics such as race, ethnicity, nationality, religion, disability, sex, sexual orientation or gender identity.",
              "Child-unsafe content, including CSAM: any sexualisation, grooming, exploitation or abuse of children or people presented as children, including synthetic, fictional or edited material. Never submit or forward illegal media to report it.",
              "Deepfakes / impersonation: cloning or imitating a real person’s voice or identity, inventing statements or endorsements attributed to them, or deceptively presenting an AI performance as theirs. Claimed permission does not make prohibited deepfake requests acceptable.",
              "Copyright / trademark infringement: copying protected lyrics or recordings without the necessary rights, requesting unauthorised artist imitation, misusing brand names or marks to suggest endorsement, or otherwise violating intellectual-property, privacy or personality rights."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Ordinary non-explicit affection, family celebrations and respectful songs about children are allowed when the necessary permissions exist. A factual name or memory is different from an instruction to impersonate someone. Misleading claims, harassment, spam and attempts to defeat safeguards are also prohibited."
          }
        ]
      },
      {
        "title": "3. How content is checked",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "SongGift uses a DeepSeek-based semantic text-safety check on the submitted story and instructions before lyric writing, on the generated lyric result, and on the approved text frozen for a new music-generation attempt. A failed or unavailable check stops that new step; it does not silently authorise another music call."
          },
          {
            "kind": "paragraph",
            "text": "These checks assess text against the categories above. They are not a guarantee that every violation will be detected. We do not claim to run an independent automated analysis of every finished audio waveform. Audio-provider safety controls are supplemented by human review when an issue is reported or identified."
          },
          {
            "kind": "paragraph",
            "text": "The operator’s authorised reviewer assesses submitted reports and relevant order or provider evidence. Access is limited to what is needed for the investigation. Private songs are not placed in a public moderation gallery, and we do not claim a 24-hour staffed moderation team."
          }
        ]
      },
      {
        "title": "4. Submit a report or appeal",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Use the on-site report form. No account is required. Choose a category and provide a SongGift page, order number or earlier report reference and a concise explanation. An email address is optional but helps us ask questions or send a progress update. The form returns a receipt only after the report is saved."
          },
          {
            "kind": "links",
            "links": [
              {
                "label": "Submit a content report",
                "href": "/report"
              }
            ]
          },
          {
            "kind": "paragraph",
            "text": "For an appeal, choose “Appeal a content decision” and identify the decision or order, explaining why you think it was wrong. Avoid including passwords, sign-in codes, full payment credentials or unnecessary private stories. Do not upload or reproduce illegal images, recordings or child abuse material. Reports are not a route to obtain somebody else’s private song."
          },
          {
            "kind": "paragraph",
            "text": "We use report details to investigate fairly, and limit disclosure of the reporter’s identity to authorised handling or a legal requirement. Deliberately abusive reports may be restricted. For immediate danger, contact local emergency services; this form is not a live emergency service."
          }
        ]
      },
      {
        "title": "5. Review targets and procedure",
        "blocks": [
          {
            "kind": "list",
            "items": [
              "Receipt: a report reference is displayed immediately after successful submission. Keep it for follow-up; no reference is shown as received if saving fails.",
              "Urgent concerns: child safety, terrorism and credible threats are prioritised. We aim to begin review within 24 hours of receipt and take protective steps promptly when warranted.",
              "Other reports: we aim to begin review within 3 business days and provide a decision or progress update within 7 business days.",
              "Appeals: request a further review through the same form. We aim to provide an outcome or progress update within 10 business days. A different authorised reviewer is used where one is available."
            ]
          },
          {
            "kind": "paragraph",
            "text": "Business days are Monday to Friday, excluding public holidays in Shanghai, China. Complex investigations or missing information can take longer. If contact details were provided, we explain delays and request further information as needed. These are service targets rather than a promise of an instant final decision."
          },
          {
            "kind": "paragraph",
            "text": "The process is receipt → priority assessment → review of the relevant content and evidence → decision → appropriate action → a recorded outcome and, where contact details are available, notification. Report status changes and reviewer notes are kept in a private administrator record."
          }
        ]
      },
      {
        "title": "6. Actions and safeguards",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "Depending on the evidence and severity, we may reject a new request, ask for an edit, warn the account holder, withdraw access to a confirmed violating hosted file, or work with the provider on further restrictions. Authorised personnel carry out and record manual actions; clicking a report status does not itself delete audio, refund a payment or ban an account."
          },
          {
            "kind": "paragraph",
            "text": "We may preserve relevant evidence and contact competent authorities where required or appropriate for serious unlawful activity. We do not promise to erase necessary investigation or payment records immediately. Measures should be proportionate, and reporting a concern does not by itself establish a violation or determine a refund."
          },
          {
            "kind": "paragraph",
            "text": "If you believe a decision was mistaken, use the appeal route above. This process does not restrict rights available under applicable law."
          }
        ]
      },
      {
        "title": "7. Operator and policy updates",
        "blocks": [
          {
            "kind": "paragraph",
            "text": "SongGift is operated by 明日逻辑 in Shanghai, China. The on-site report form is the primary content-reporting channel. For general enquiries, the support address is support@songforalways.com. Use the on-site form for a saved content-report reference."
          },
          {
            "kind": "links",
            "links": [
              {
                "label": "Report form",
                "href": "/report"
              },
              {
                "label": "Privacy Policy",
                "href": "/policies/privacy"
              },
              {
                "label": "Contact support",
                "href": "/contact"
              }
            ]
          },
          {
            "kind": "paragraph",
            "text": "We update these standards when the service or applicable requirements change and give notice of material changes where required. The effective date is shown above."
          }
        ]
      }
    ]
  }
};
