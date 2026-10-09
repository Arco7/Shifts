// config.js: the only file you edit after the Google Cloud setup.
export const CONFIG = {
  // Paste the "Client ID" from Google Cloud here (looks like 1234-abc.apps.googleusercontent.com).
  GOOGLE_CLIENT_ID: '8arkasha8@gmail.com',
  // Name of the visible folder in Google Drive. The app finds the folder by a hidden mark,
  // so renaming this later does not lose old backups.
  DRIVE_FOLDER: 'Shifts Backups',
  // How many backup files to keep (Drive and phone folder). The oldest is removed only
  // after a new one is written and verified.
  KEEP: 10,
  // Automatic backup after changes: not more often than this (minutes). Keeps the 10 copies
  // spread over several days instead of 10 quick edits. The "back up now" button ignores it.
  AUTO_GAP_MIN: 180,
  APP_VERSION: '0.1.0',
};
