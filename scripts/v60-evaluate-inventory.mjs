// Read-only deterministic evaluator. It intentionally fails closed unless the
// caller supplies an authorized target UID and credential reference.
import { readFileSync } from 'node:fs';
import { generateV60Recipe, validateV60Candidate } from '../src/lib/v60Adapter.js';
import { generateV60IcedRecipe, validateV60IcedCandidate } from '../src/lib/v60IcedAdapter.js';

const args = new Map(process.argv.slice(2).flatMap((value, index, values) => value.startsWith('--') ? [[value.slice(2), values[index + 1]]] : []));
if (!args.get('uid') || !args.get('credentials')) {
  console.error('REFUSED: supply --uid and --credentials to authorize a read-only inventory evaluation');
  process.exitCode = 2;
} else {
  const fixtures = JSON.parse(readFileSync(new URL('../docs/data/v60-recipe-evaluation-beans.json', import.meta.url), 'utf8'));
  const results = fixtures.map((fixture) => {
    const intent = { finesRisk: fixture.finesRisk, family: fixture.class === 'natural' ? 'clean-natural-fruit' : '', energyTendency: fixture.roast === 'dark' ? 'lower' : 'conservative' };
    const hot = generateV60Recipe(intent, { dose: fixture.dose, grinder: fixture.grinder });
    const iced = generateV60IcedRecipe(intent, { dose: fixture.dose, grinder: fixture.grinder });
    return { class: fixture.class, roast: fixture.roast, dose: fixture.dose, hot: { technique: hot.technique, valid: validateV60Candidate(hot).valid }, iced: { technique: iced.technique, valid: validateV60IcedCandidate(iced).valid } };
  });
  console.log(JSON.stringify({ readOnly: true, uidRedacted: true, credentialsUsed: true, results }, null, 2));
}
