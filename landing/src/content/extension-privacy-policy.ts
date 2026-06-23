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
    text: `This Privacy Policy ("Policy") explains the information collection, use, and sharing practices of ${COMPANY_NAME} ("we," "us," and "our").`,
  },
  {
    type: "p",
    text: `Unless otherwise stated, this Policy describes and governs the information collection, use, and sharing practices of ${COMPANY_NAME} with respect to your use of our services ("Services") we provide and/or host on our servers, including the ${COMPANY_NAME} Chrome extension and imageprompt.tools.`,
  },
  {
    type: "p",
    text: "Before you use or submit any information through or in connection with the Services, please carefully review this Privacy Policy. By using any part of the Services, you understand that your information will be collected, used, and disclosed as outlined in this Privacy Policy.",
  },
  {
    type: "p",
    text: "If you do not agree to this privacy policy, please do not use our Services.",
  },
];

export const EXTENSION_PRIVACY_SECTIONS: PrivacySection[] = [
  {
    heading: "Our Principles",
    blocks: [
      {
        type: "p",
        text: `${COMPANY_NAME} has designed this policy to be consistent with the following principles:`,
      },
      {
        type: "ul",
        items: [
          "Privacy policies should be human readable and easy to find.",
          "Data collection, storage, and processing should be simplified as much as possible to enhance security, ensure consistency, and make the practices easy for users to understand.",
          "Data practices should meet the reasonable expectations of users.",
        ],
      },
    ],
  },
  {
    heading: "Information We Collect",
    blocks: [
      {
        type: "p",
        text: "We collect information in multiple ways, including when you provide information directly to us; when we passively collect information from you, such as from your browser or device; and from third parties.",
      },
      { type: "h3", text: "Information You Provide Directly to Us" },
      {
        type: "p",
        text: "We will collect any information you provide to us. We may collect information from you in a variety of ways, such as when you: (a) create an online account, (b) make a donation or purchase, (c) contact us or provide feedback, or (d) subscribe to communications from us. This information may include but is not limited to your name, email address, payment information, and information you include in messages to us.",
      },
      {
        type: "p",
        text: "When you use the Chrome extension, this information may also include images you choose to analyze, image URLs you select from webpages, generated descriptions, generated prompts, selected prompt style, and related output settings.",
      },
      { type: "h3", text: "Information that Is Automatically Collected" },
      { type: "h3", text: "Device/Usage Information" },
      {
        type: "p",
        text: "We may automatically collect certain information about the computer or devices (including mobile devices or tablets) you use to access the Services. As described further below, we may collect and analyze (a) device information such as IP addresses, browser types, browser language, operating system, and (b) information related to the ways in which you interact with the Services, such as platform type, the number of clicks, pages and content viewed within the Services, statistical information about the use of the Services, the date and time you used the Services, the frequency of your use of the Services, error logs, and other similar information.",
      },
      {
        type: "p",
        text: "For the Chrome extension, device and usage information may include extension version, browser type, operating system, interface language, session identifier, selected mode or style, feature interactions, request status, error codes, timestamps, quota state, and similar diagnostic events. We may process IP address on our server and convert it into a daily hash for rate limiting, abuse prevention, and service protection.",
      },
      { type: "h3", text: "Cookies and Other Tracking Technologies" },
      {
        type: "p",
        text: "We also collect data about your use of the Services through the use of Internet server logs and online tracking technologies, like cookies and/or similar browser technologies. A web server log is a file where website activity is stored. A cookie is a small text file that is placed on your computer when you visit a website and may help us store preferences and settings, understand how the Services are used, enhance user experience, perform analytics, and assist with security administrative functions.",
      },
      {
        type: "p",
        text: "The Chrome extension primarily uses Chrome extension storage, session storage, local storage, and IndexedDB to store preferences, language settings, quota state, authentication state, pending analysis or remix jobs, local history, and local image blobs or thumbnails. You can change your browser settings to block or remove cookies and can remove extension-local data by clearing extension/site data or uninstalling the extension.",
      },
      { type: "h3", text: "Information from Third Parties" },
      {
        type: "p",
        text: "To the extent permitted by law, we may also collect information from third parties that help us provide the Services. For example, if you choose to sign in with Google, we may receive basic account information such as your account identifier and email address.",
      },
    ],
  },
  {
    heading: "How We Use Your Information",
    blocks: [
      { type: "p", text: "We may use the information we collect from and about you to:" },
      {
        type: "ul",
        items: [
          "Fulfill the purposes for which you provided it.",
          "Provide and improve the Services, including to develop new features or services, take steps to secure the Services, and for technical and customer support.",
          "Analyze images you choose and generate text descriptions or prompts.",
          "Provide Chrome extension functionality, including side panel, context menu, overlay, local history, pending jobs, quota checks, and signed-in features.",
          "Prevent abuse, enforce usage limits, diagnose errors, and maintain service reliability.",
          "Process transactions, if paid features are available.",
          "Send you information about your interaction or transactions with us, account alerts, or other communications to which you have subscribed.",
          "Process and respond to your inquiries or to request your feedback.",
          "Conduct analytics, research, and reporting, including to synthesize and derive insights from your use of our Services.",
          `Comply with the law and protect the safety, rights, property, or security of ${COMPANY_NAME}, the Services, our users, and the general public; and`,
          "Enforce our Terms of Use, including to investigate potential violations thereof.",
        ],
      },
      {
        type: "p",
        text: "Please note that we may combine information that we collect from you and about you (including automatically collected information) with information we obtain about you from service providers and use such combined information in accordance with this Privacy Policy.",
      },
      {
        type: "p",
        text: "We may aggregate and/or de-identify information collected through the Services. We may use de-identified and/or aggregated data for internal analytics, reliability monitoring, and product improvement.",
      },
    ],
  },
  {
    heading: "When We Disclose Your Information",
    blocks: [
      {
        type: "p",
        text: "We may disclose and/or share your information under the following circumstances:",
      },
      { type: "h3", text: "Service Providers." },
      {
        type: "p",
        text: "We may disclose your information with third parties who perform services on our behalf, including without limitation, customer support, data storage, data analysis and processing, authentication, AI processing, security, and legal services.",
      },
      {
        type: "p",
        text: "For the Chrome extension, service providers may include imageprompt.tools backend services, Google Gemini API for image and prompt processing, Google sign-in for optional authentication, and Supabase for authentication-related records, database storage, quota/rate-limit data, and extension usage events.",
      },
      { type: "h3", text: `Legal Compliance and Protection of ${COMPANY_NAME} and Others.` },
      {
        type: "p",
        text: `We may disclose your information if required to do so by law or on a good faith belief that such disclosure is permitted by this Privacy Policy or reasonably necessary or appropriate for any of the following reasons: (a) to comply with legal process; (b) to enforce or apply our Terms of Use and this Privacy Policy, or other contracts with you, including investigation of potential violations thereof; (c) to respond to your requests for customer service; and/or (d) to protect the rights, property, or personal safety of ${COMPANY_NAME}, our agents and affiliates, our users, and the public. This includes exchanging information with other companies and organizations for fraud protection, abuse prevention, spam/malware prevention, and similar purposes.`,
      },
      { type: "h3", text: "Business Transfers." },
      {
        type: "p",
        text: "As we continue to develop our business, we may engage in certain business transactions, such as the transfer or sale of our assets. In such transactions, including in contemplation of such transactions, your information may be disclosed. If any of our assets are sold or transferred to a third party, customer information may be one of the transferred business assets.",
      },
      { type: "h3", text: "Affiliated Companies." },
      {
        type: "p",
        text: "We may disclose your information with current or future affiliated companies.",
      },
      { type: "h3", text: "Consent." },
      {
        type: "p",
        text: "We may disclose your information to any third parties based on your consent to do so.",
      },
      { type: "h3", text: "Aggregate/De-identified Information." },
      {
        type: "p",
        text: "We may disclose de-identified and/or aggregated data for internal analytics, reliability monitoring, and product improvement.",
      },
    ],
  },
  {
    heading: "Chrome Extension Permissions",
    blocks: [
      {
        type: "p",
        text: "The Chrome extension may request permissions such as contextMenus, storage, unlimitedStorage, activeTab, scripting, tabs, sidePanel, and host access for webpages. These permissions are used to add image actions to the right-click menu, open and operate the side panel, support the selected tab or image workflow, store preferences, local history, quota state, pending jobs, authentication state, and local image blobs or thumbnails, and let users analyze images they choose from webpages.",
      },
    ],
  },
  {
    heading: "Limited Use",
    blocks: [
      {
        type: "p",
        text: "We use data received from the Chrome extension only to provide and improve the extension's purpose: turning user-selected images into descriptions and prompts. We do not sell user data, use user data for personalized advertising, transfer user data to unrelated third parties, or use user data for unrelated product purposes.",
      },
    ],
  },
  {
    heading: "Legal Basis for Processing Personal Data",
    blocks: [
      {
        type: "p",
        text: "The laws in some jurisdictions require companies to tell you about the legal ground they rely on to use or disclose information that can be directly linked to or used to identify you. To the extent those laws apply, our legal grounds for processing such information are as follows:",
      },
      { type: "h3", text: "To Honor Our Contractual Commitments to You." },
      {
        type: "p",
        text: "Much of our processing of information is to meet our contractual obligations to provide services to our users.",
      },
      { type: "h3", text: "Legitimate Interests." },
      {
        type: "p",
        text: "In many cases, we handle information on the ground that it furthers our legitimate interests in ways that are not overridden by the interests or fundamental rights and freedoms of the affected individuals, these include:",
      },
      {
        type: "ul",
        items: [
          "Customer service",
          "Protecting our users, personnel, and property",
          "Managing user accounts",
          "Analyzing and improving our business",
          "Managing legal issues",
          "Providing and improving image-to-prompt extension functionality",
          "Preventing abuse and maintaining service reliability",
        ],
      },
      {
        type: "p",
        text: "We may also process information for the same legitimate interests of our users and business partners.",
      },
      { type: "h3", text: "Legal Compliance." },
      {
        type: "p",
        text: "We may need to use and disclose information in certain ways to comply with our legal obligations.",
      },
      { type: "h3", text: "Consent." },
      {
        type: "p",
        text: "Where required by law, and in some other cases where legally permissible, we handle your information on the basis of consent. Where we handle your information on the basis of consent, you have the right to withdraw your consent in accordance with applicable law.",
      },
    ],
  },
  {
    heading: "Online Analytics",
    blocks: [
      {
        type: "p",
        text: "We may use analytics services on our Services to collect and analyze the information discussed above, and to engage in auditing, research, or reporting. For the Chrome extension, analytics may include limited product interaction and diagnostic events such as request start, result shown, copy prompt, error shown, selected mode, selected style, locale, browser, platform, extension version, timestamps, and session identifier.",
      },
      {
        type: "p",
        text: "We do not use extension analytics for personalized advertising.",
      },
    ],
  },
  {
    heading: "Your Choices and Data Subject Rights",
    blocks: [
      {
        type: "p",
        text: "You have various rights with respect to the collection and use of your information through the Services. Those choices are as follows:",
      },
      { type: "h3", text: "Email Unsubscribe" },
      {
        type: "p",
        text: `You may unsubscribe from marketing emails at any time by clicking the unsubscribe link, where available, or by emailing ${CONTACT_EMAIL} with your request.`,
      },
      { type: "h3", text: "Account Preferences" },
      {
        type: "p",
        text: "If you have registered for an account with us through our Services, you can update your account information or adjust account preferences by logging into your account and updating your settings.",
      },
      { type: "h3", text: "Extension and Local Data Controls" },
      {
        type: "p",
        text: "You can choose which images to analyze, sign out to remove the local app session token used for signed-in features, clear extension or site data through your browser, or uninstall the extension to remove extension-local data.",
      },
      { type: "h3", text: "Data Subject Rights" },
      {
        type: "p",
        text: `Individuals in certain jurisdictions have legal rights, subject to applicable exceptions and limitations, to obtain confirmation of whether we hold certain information about them, to access such information, and to obtain its correction or deletion in appropriate circumstances. You may have the right to object to our handling of your information, restrict our processing of your information, and withdraw any consent you have provided. To exercise these rights, please email us at ${CONTACT_EMAIL} with the nature of your request.`,
      },
    ],
  },
  {
    heading: "International Transfers",
    blocks: [
      {
        type: "p",
        text: "As described above in the “When We Disclose Your Information” section, we may share your information with trusted service providers or business partners in countries other than your country of residence in accordance with applicable law. This means that some of your information may be processed in countries that may not offer the same level of protection as the privacy laws of your jurisdiction. By providing us with your information, you acknowledge any such transfer, storage or use.",
      },
      {
        type: "p",
        text: "If we provide any information about you to any third-party information processors, we will take appropriate measures designed to ensure such companies protect your information in accordance with this Privacy Policy and applicable data protection laws.",
      },
    ],
  },
  {
    heading: "Security Measures",
    blocks: [
      {
        type: "p",
        text: "We have implemented technical and organizational security measures designed to protect against the loss, misuse, and/or alteration of your information. We use HTTPS for data transmitted between the extension, imageprompt.tools, and service providers. However, we cannot and do not guarantee that these measures will prevent every unauthorized attempt to access, use, or disclose your information, since no Internet and/or electronic transmission can be completely secure.",
      },
    ],
  },
  {
    heading: "Children",
    blocks: [
      {
        type: "p",
        text: "The Services are not directed to children under the age of 13. If we become aware that we have collected personal information from children under the age of 13, we will take reasonable steps to delete it as soon as practicable.",
      },
    ],
  },
  {
    heading: "Data Retention",
    blocks: [
      {
        type: "p",
        text: "We retain the information we collect for as long as necessary to fulfill the purposes set forth in this Privacy Policy or as long as we are legally required or permitted to do so. Information may persist in copies made for backup and business continuity purposes for additional time.",
      },
      {
        type: "p",
        text: "Local history and local image data remain on your device until removed by you, cleared by browser storage controls, or removed by uninstalling the extension. Server-side quota, usage, diagnostic, and security records may be retained as needed to operate the Services, prevent abuse, troubleshoot issues, and maintain account-related functionality.",
      },
    ],
  },
  {
    heading: "Third-Party Links and Services",
    blocks: [
      {
        type: "p",
        text: `${COMPANY_NAME} may contain links to third-party websites or services. ${COMPANY_NAME} is not responsible for the content or privacy practices of third-party websites or services. The collection, use, and disclosure of your information will be subject to the privacy policies of the third-party websites or services, and not this Privacy Policy. We encourage you to read the privacy statements of each site or service you visit.`,
      },
    ],
  },
  {
    heading: "Changes to this Privacy Policy",
    blocks: [
      {
        type: "p",
        text: "We will continue to evaluate this Privacy Policy as we update and expand our Services, and we may make changes to the Privacy Policy accordingly. We will post any changes here and revise the date last updated above. We encourage you to check this page periodically for updates to stay informed on how we collect, use, and share your information.",
      },
    ],
  },
  {
    heading: "Questions About this Privacy Policy",
    blocks: [
      {
        type: "p",
        text: `If you have any questions about this Privacy Policy or our privacy practices, you can contact us at: ${CONTACT_EMAIL}.`,
      },
    ],
  },
];
