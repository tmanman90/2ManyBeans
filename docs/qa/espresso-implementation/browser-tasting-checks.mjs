import assert from 'node:assert/strict';

// Drives the existing eight sensory controls through DOM actions. It never
// inserts a tasting record or supplies application answers behind the UI.
export async function finishTastingSteps(page, { note = 'Cocoa and a smooth finish.', espresso = true, startAt = 0, afterFirstAnswer = null } = {}) {
  const keys = ['smell', 'firstsip', 'acidity', 'sweetness', 'body', 'flavor', 'finish', 'balance'];
  const answers = [];
  for (let index = startAt; index < keys.length; index++) {
    const key = keys[index];
    const step = page.locator(`[data-wizard-step="${key}"]`);
    await step.waitFor();
    if (espresso) {
      assert.doesNotMatch(await step.innerText(), /break the (?:floating )?crust|wait four minutes/i);
      assert.equal(await step.locator('[data-expected-marker="bone"]').count(), 0, 'Espresso must not present an uncalibrated numeric expectation');
    }
    if (key === 'firstsip') {
      await step.getByRole('button', { name: 'Round & smooth', exact: true }).click();
    } else {
      const slider = step.getByRole('slider');
      await slider.scrollIntoViewIfNeeded();
      const box = await slider.boundingBox();
      await slider.click({ position: { x: box.width * 0.6, y: box.height / 2 } });
      const score = Number(await slider.getAttribute('aria-valuenow'));
      assert.ok(Number.isFinite(score) && score > 0 && score <= 10);
      answers.push({ key, score });
      await step.locator('textarea').fill(`${key}: ${note}`);
    }
    if (index === 0 && afterFirstAnswer) await afterFirstAnswer();
    await page.getByRole('button', { name: index === keys.length - 1 ? 'See your cup' : 'Next', exact: true }).click();
    await step.waitFor({ state: 'detached' });
  }
  await page.getByPlaceholder('One word for this cup…').fill('Cocoa');
  await page.getByPlaceholder('In your own words — what did you think of this cup? (optional)').fill(note);
  await page.getByRole('button', { name: 'Save tasting', exact: true }).click();
  await page.getByRole('button', { name: 'Save tasting', exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Start guided tasting', exact: true }).waitFor();
  return answers;
}
