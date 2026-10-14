import { accounts, expect, MEMBER_STATE, signIn, test } from "./fixtures.ts"

// Signs the member in once; the browser projects reuse the saved session.
test("sign in as the member", async ({ page }) => {
  const { member } = accounts()
  await signIn(page, member.email, member.password)
  await expect(page.getByRole("heading", { name: "Hello, Member" })).toBeVisible()
  await page.context().storageState({ path: MEMBER_STATE })
})
