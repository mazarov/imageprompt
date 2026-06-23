# Chrome Web Store Privacy Practices Checklist

Use this checklist when resubmitting AI Image Describer after a User Data Privacy rejection.

## Privacy Policy URL

- Use `https://imageprompt.tools/privacy`.
- Confirm the page is public, HTTPS, does not require sign-in, and shows the latest update date.
- Keep the policy neutral: do not add a physical address, country, registration details, or team location.

## Data Types to Declare

Declare only data that matches the current extension behavior:

- Website content: images or image URLs the user chooses from webpages for image-to-prompt analysis.
- User activity or product interaction: extension events such as request start, result shown, copy prompt, errors, selected mode, selected style, locale, browser, platform, extension version, and session identifier.
- Authentication information: app session token and account identifier when the user signs in.
- Personally identifiable information: email address or account identifier if collected through Google sign-in or direct contact.

Do not declare unrelated categories such as financial data, health data, personal communications, or location unless the implementation changes.

## Data Usage

Use purposes that match the policy:

- App functionality: analyze selected images, generate prompts, manage sign-in, quota, and local history.
- Analytics: understand extension reliability and feature usage.
- Developer communications: respond to support or privacy requests.
- Security and abuse prevention: rate limiting, diagnostics, and service protection.

Do not select advertising, personalized advertising, creditworthiness, or sale/transfer of data.

## Sharing

Declare that data is shared only with service providers needed for the extension:

- Google Gemini API: processes selected images and prompt instructions to return text output.
- Google sign-in: optional authentication.
- Supabase: authentication-related records, quota/rate-limit data, database storage, and extension usage events.
- imageprompt.tools backend: receives extension requests and coordinates the service.

## Limited Use

Confirm that extension data is used only to provide and improve the single purpose of the extension: turning user-selected images into descriptions and prompts.

Confirm that extension data is not:

- Sold.
- Used for personalized advertising.
- Transferred to unrelated third parties.
- Used for unrelated product purposes.

## Permissions Notes

Use concise permission explanations:

- `contextMenus`: adds image actions to the right-click menu.
- `storage` and `unlimitedStorage`: stores preferences, quota state, local history, pending jobs, auth state, and local image blobs or thumbnails.
- `activeTab`, `scripting`, `tabs`, and `sidePanel`: opens the side panel and supports the selected tab/image workflow.
- Host access: lets the extension show its image overlay and analyze images the user chooses from webpages.

## Final Resubmission Check

- The Developer Dashboard privacy declarations match the text at `https://imageprompt.tools/privacy`.
- The privacy policy names all service providers used for user data processing.
- The policy and dashboard both state that data is not sold and not used for personalized advertising.
- No unnecessary identity, country, address, or jurisdiction details are added.
