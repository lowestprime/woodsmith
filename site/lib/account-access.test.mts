import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { accountEmailVerified, safeAccountRedirect } from "./account-access.ts";
import { resolveAssetUrl } from "./format.ts";
import { profileAvatarMetadata } from "./avatar.ts";

test("pending customer sessions cannot claim verified-email access; staff and verified customers retain access", () => {
  assert.equal(accountEmailVerified(null), false);
  assert.equal(accountEmailVerified({role:"customer",emailVerified:false}), false);
  assert.equal(accountEmailVerified({role:"customer",emailVerified:true}), true);
  assert.equal(accountEmailVerified({role:"admin",emailVerified:false}), true);
  assert.equal(accountEmailVerified({role:"woodworker",emailVerified:false}), true);
  for (const target of ["https://example.test", "//example.test", "/\\example.test", "javascript:alert(1)", "/\n/example.test"]) assert.equal(safeAccountRedirect(target), "/account/profile");
  assert.equal(safeAccountRedirect("/account/projects?show=1#current"), "/account/projects?show=1#current");
});

test("profile gradient persists typed colors while preserving unrelated metadata and rejecting unsafe input", () => {
  const fields=new FormData();fields.set("avatarGradientFrom","#123456");fields.set("avatarGradientTo","hsl(30, 50%, 50%)");fields.set("avatarGradientAngle","400");
  assert.deepEqual(profileAvatarMetadata({custom:"keep"},fields),{custom:"keep",avatarGradient:{from:"#123456",to:"hsl(30, 50%, 50%)",angle:360}});
  fields.set("avatarGradientFrom","url(https://example.test)");assert.deepEqual(profileAvatarMetadata({custom:"keep"},fields),{custom:"keep"});
});

test("verification/reset expiry, token consumption, session revocation and reopen preserve account boundaries", async () => {
  const root=mkdtempSync(path.join(tmpdir(),"woodsmith-accounts-"));
  const prior={DATA_ROOT:process.env.DATA_ROOT,NODE_ENV:process.env.NODE_ENV};process.env.DATA_ROOT=root;process.env.NODE_ENV="test";
  const db=await import("./db.ts");
  try {
    const email="account-fixture@example.test";db.saveUserProfile({email,role:"customer",displayName:"Fixture",headline:"",bio:"",avatarPath:null,publicProfile:false,links:[],metadata:{},passwordHash:"fixture-password-hash"});
    const future=new Date(Date.now()+60000).toISOString(),past=new Date(Date.now()-60000).toISOString();
    db.setEmailVerificationToken(email,"verify-fixture",past);assert.equal(db.getUserByVerificationToken("verify-fixture"),null);
    db.setEmailVerificationToken(email,"verify-fixture",future);assert.equal(db.getUserByVerificationToken("verify-fixture")?.email,email);
    assert.equal(accountEmailVerified(db.getUserByEmail(email)),false);db.markEmailVerified(email);assert.equal(db.getUserByVerificationToken("verify-fixture"),null);assert.equal(accountEmailVerified(db.getUserByEmail(email)),true);
    db.setPasswordResetToken(email,"reset-fixture",past);assert.equal(db.getUserByResetToken("reset-fixture"),null);
    db.setPasswordResetToken(email,"reset-fixture",future);assert.equal(db.getUserByResetToken("reset-fixture")?.email,email);
    db.withDatabaseTransaction(sql=>sql.prepare("UPDATE users SET reset_expires_at=NULL WHERE email=?").run(email));assert.equal(db.getUserByResetToken("reset-fixture"),null);
    db.setPasswordResetToken(email,"reset-fixture",future);db.createSessionRecord(email,"old-session-fixture",future);assert.ok(db.getSessionRecord("old-session-fixture"));
    db.setPasswordHash(email,"new-fixture-password-hash");assert.equal(db.getUserByResetToken("reset-fixture"),null);assert.equal(db.getSessionRecord("old-session-fixture"),null);
    db.closeDatabaseForTests();assert.equal(db.getSessionRecord("old-session-fixture"),null);assert.equal(db.getUserByResetToken("reset-fixture"),null);assert.equal(db.getUserByEmail(email)?.emailVerified,true);
  } finally {db.closeDatabaseForTests();for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}rmSync(root,{recursive:true,force:true});}
});

test("uploaded profile photos use persisted media while bundled seed portraits keep their static route", () => {
  assert.equal(resolveAssetUrl("profiles/uploaded-photo.png"),"/media/profiles/uploaded-photo.png");
  assert.equal(resolveAssetUrl("profiles/william-beaman.svg"),"/profiles/william-beaman.svg");
  assert.equal(resolveAssetUrl("/media/profiles/existing.png"),"/media/profiles/existing.png");
});
