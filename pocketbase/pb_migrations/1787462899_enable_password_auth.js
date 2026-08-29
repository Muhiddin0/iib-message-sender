/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const googleSubject = users.fields.getByName("google_subject");

  googleSubject.required = false;
  users.passwordAuth.enabled = true;
  users.passwordAuth.identityFields = ["email"];
  users.authRule = "";
  users.removeIndex("idx_users_google_subject");
  users.addIndex(
    "idx_users_google_subject",
    true,
    "google_subject",
    "google_subject != ''",
  );
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  const passwordOnlyUsers = app.findRecordsByFilter(
    users,
    'google_subject = ""',
    "",
    1,
    0,
  );
  if (passwordOnlyUsers.length > 0) {
    throw new Error("Cannot disable password auth while password-only users exist");
  }

  const googleSubject = users.fields.getByName("google_subject");
  googleSubject.required = true;
  users.passwordAuth.enabled = false;
  users.removeIndex("idx_users_google_subject");
  users.addIndex("idx_users_google_subject", true, "google_subject", "");
  app.save(users);
});

