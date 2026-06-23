export const COMPANY_NAME = "AI Image Describer";
export const CONTACT_EMAIL = "azarov.maxim@gmail.com";
export const LAST_UPDATED = "June 23, 2026";

export type PrivacyBlock =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] };

export type PrivacySection = {
  heading?: string;
  blocks: PrivacyBlock[];
};

export const EXTENSION_PRIVACY_INTRO: PrivacyBlock[] = [
  {
    type: "p",
    text: `This Privacy Policy explains how ${COMPANY_NAME} ("we," "us," and "our") collects, uses, stores, and shares information when you use the ${COMPANY_NAME} Chrome extension and related services on imageprompt.tools.`,
  },
  {
    type: "p",
    text: `${COMPANY_NAME} helps you turn images you choose into text descriptions and ready-to-use prompts. We use your information only to provide, protect, maintain, and improve this functionality.`,
  },
  {
    type: "p",
    text: `If you have questions about this policy, contact us at ${CONTACT_EMAIL}.`,
  },
];

export const EXTENSION_PRIVACY_SECTIONS: PrivacySection[] = [
  {
    heading: "Information We Collect",
    blocks: [
      {
        type: "p",
        text: "We collect only the information needed to operate the extension and related image-to-prompt features.",
      },
      { type: "h3", text: "Images and image information" },
      {
        type: "ul",
        items: [
          "Images you choose to analyze, including images you upload, paste, drag into the extension, or select from a webpage.",
          "Image URLs when you ask the extension to analyze or open an image from a webpage.",
          "Generated descriptions, prompts, selected prompt style, and related image settings returned by the service.",
        ],
      },
      { type: "h3", text: "Account information" },
      {
        type: "ul",
        items: [
          "If you sign in, we may receive basic account information from Google sign-in, such as your account identifier and email address.",
          "The extension stores an app session token locally so signed-in features and quota checks can work.",
          "If you contact us, we collect the information you include in your message so we can respond.",
        ],
      },
      { type: "h3", text: "Usage and technical information" },
      {
        type: "ul",
        items: [
          "Extension version, browser type, operating system, interface language, session identifier, selected mode, selected style, feature interactions, errors, timestamps, and similar diagnostic events.",
          "IP address is processed by our server and converted into a daily hash for rate limiting and abuse prevention.",
          "Request metadata such as response status, latency, quota state, and whether a request succeeded or failed.",
        ],
      },
    ],
  },
  {
    heading: "How We Use Information",
    blocks: [
      {
        type: "p",
        text: "We use collected information for the following purposes:",
      },
      {
        type: "ul",
        items: [
          "To analyze images you choose and generate text descriptions or prompts.",
          "To provide signed-in features, quota checks, and account-related access.",
          "To save local preferences, local history, pending jobs, and recently generated results.",
          "To monitor reliability, diagnose errors, prevent abuse, enforce limits, and improve extension quality.",
          "To respond to privacy, support, or feedback requests that you send to us.",
        ],
      },
    ],
  },
  {
    heading: "Local Storage",
    blocks: [
      {
        type: "p",
        text: "The extension stores some information on your device so the product works between sessions.",
      },
      {
        type: "ul",
        items: [
          "Chrome storage may store settings, language preference, quota information, auth state, pending analysis or remix jobs, and recognition history metadata.",
          "IndexedDB may store image blobs or thumbnails used by local recognition history.",
          "Session storage may temporarily store an image selected for handoff between the extension and imageprompt.tools.",
          "Local storage on imageprompt.tools may store recognition history used by the site experience.",
        ],
      },
      {
        type: "p",
        text: "You can remove locally stored extension data by clearing extension/site data, clearing history inside the product where available, signing out, or uninstalling the extension.",
      },
    ],
  },
  {
    heading: "Sharing and Service Providers",
    blocks: [
      {
        type: "p",
        text: "We do not sell personal data. We do not use extension data for personalized advertising. We share data only as needed to operate, secure, and improve the extension.",
      },
      {
        type: "ul",
        items: [
          "imageprompt.tools API receives images, image URLs, prompts, account tokens, quota requests, and usage events needed to provide the extension features.",
          "Google Gemini API processes images and prompt instructions to generate image descriptions and prompt text.",
          "Google sign-in is used when you choose to authenticate with a Google account.",
          "Supabase is used for authentication-related records, database storage, rate limits, quotas, and extension usage events.",
        ],
      },
      {
        type: "p",
        text: "We may also disclose information if required to comply with law, enforce our terms, protect users, investigate abuse, or protect the security and integrity of the service.",
      },
    ],
  },
  {
    heading: "Data Retention",
    blocks: [
      {
        type: "p",
        text: "We keep information only for as long as reasonably needed for the purposes described in this policy.",
      },
      {
        type: "ul",
        items: [
          "Images you choose are processed to generate the requested output. We do not sell images or use them for personalized advertising.",
          "Local history and local image data remain on your device until removed by you, cleared by browser storage controls, or removed by uninstalling the extension.",
          "Server-side quota, usage, diagnostic, and security records may be retained as needed to operate the service, prevent abuse, troubleshoot issues, and maintain account or billing-related functionality.",
          "Support messages are retained as needed to respond and maintain a record of the request.",
        ],
      },
    ],
  },
  {
    heading: "Chrome Extension Permissions",
    blocks: [
      {
        type: "p",
        text: "The extension requests Chrome permissions only to provide the image-to-prompt workflow shown in the extension.",
      },
      {
        type: "ul",
        items: [
          "contextMenus: adds image actions to the right-click menu.",
          "storage and unlimitedStorage: stores preferences, local history, quota state, pending jobs, auth state, and local image blobs or thumbnails.",
          "activeTab, scripting, tabs, and sidePanel: opens the side panel and supports the selected tab/image workflow.",
          "Host access for webpages: lets the extension show its image overlay and analyze images that you choose from webpages.",
        ],
      },
    ],
  },
  {
    heading: "Your Choices",
    blocks: [
      {
        type: "ul",
        items: [
          "You choose which images to analyze.",
          "You can use the extension without signing in when guest access is available.",
          "You can sign out to remove the local app session token used for signed-in features.",
          "You can clear extension/site data or uninstall the extension to remove local data stored by the extension.",
          `You can contact ${CONTACT_EMAIL} to request access, deletion, or other privacy assistance related to information we maintain.`,
        ],
      },
    ],
  },
  {
    heading: "Limited Use",
    blocks: [
      {
        type: "p",
        text: "We use data received from the extension only to provide and improve the extension's single purpose: turning user-selected images into descriptions and prompts. We do not sell this data, transfer it for unrelated purposes, or use it for personalized advertising.",
      },
    ],
  },
  {
    heading: "Security",
    blocks: [
      {
        type: "p",
        text: "We use HTTPS for data transmitted between the extension, imageprompt.tools, and service providers. No method of transmission or storage is perfectly secure, but we use reasonable technical and organizational measures designed to protect information handled by the service.",
      },
    ],
  },
  {
    heading: "Children",
    blocks: [
      {
        type: "p",
        text: "The extension is not directed to children under 13, and we do not knowingly collect personal information from children under 13.",
      },
    ],
  },
  {
    heading: "Changes to this Policy",
    blocks: [
      {
        type: "p",
        text: "We may update this Privacy Policy from time to time. When we do, we will update the date at the top of this page.",
      },
    ],
  },
  {
    heading: "Contact",
    blocks: [
      {
        type: "p",
        text: `For privacy questions or requests, contact us at ${CONTACT_EMAIL}.`,
      },
    ],
  },
];
