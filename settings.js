// =========================================================
// Campus Lost & Found — SETTINGS
// Change these to match your school. No other file needs editing.
// =========================================================
export const SETTINGS = {
  // Only allow sign-in with these email endings. Leave empty [] to allow any Google account.
  // Example: ["student.unilag.edu.ng", "unilag.edu.ng"]
  // (Also update allowedEmail() in firestore.rules so the database enforces it too.)
  allowedEmailDomains: [],

  // Security's WhatsApp number for the "Message security" button.
  // International format, digits only, no + or spaces. Example: "2348012345678"
  // Leave empty "" to hide the button.
  securityWhatsApp: "",

  // Items unclaimed for this many days get a "Long unclaimed" label.
  longUnclaimedDays: 60,

  // Item categories (shown in the upload form and as filters)
  categories: [
    "Phone", "ID card", "ATM card", "Keys", "Wallet", "Bag", "Laptop & gadgets",
    "Books & notes", "Clothing", "Bottle", "Jewellery", "Documents", "Other",
  ],

  // Photos of items in these categories are blurred until a claim is approved
  sensitiveCategories: ["ID card", "ATM card", "Documents"],

  // Campus locations for the dropdowns ("Other" is added automatically)
  locations: [
    "Main Library", "Faculty of Science", "Faculty of Arts", "Faculty of Engineering",
    "Faculty of Social Sciences", "Faculty of Law", "Lecture theatre / hall", "Cafeteria",
    "Student Union Building", "Sports Complex", "Hostels", "Chapel / Mosque",
    "Health Centre", "Admin Block", "Car park", "Main Gate",
  ],
};
