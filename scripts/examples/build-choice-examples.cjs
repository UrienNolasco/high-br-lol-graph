// Run after npm run build. Consumes a public calculation contract and explicit synthetic inputs.
const fs = require('node:fs');
const path = require('node:path');
const {calculateBuildChoices, normalizeBuildChoiceFilters} = require('../../dist/modules/analytics/contracts/build-choices');
const input = JSON.parse(fs.readFileSync(path.join(__dirname,'../../docs/analysis/met26-build-choice-input.json'),'utf8'));
const examples = input.scenarios.map(scenario => ({name:scenario.name,synthetic:true,response:calculateBuildChoices({
  ...scenario.cohort,matches:scenario.cohort.matches.map(m => ({...m,processing:m.processing ? {...m.processing,completedAt:new Date(m.processing.completedAt)} : null})),
},normalizeBuildChoiceFilters(input.filters),input.catalogs)}));
const output = process.argv[2] ?? path.join(__dirname,'../../docs/analysis/met26-build-choice-examples.json');
fs.writeFileSync(output,JSON.stringify({methodVersion:1,synthetic:true,examples},null,2)+'\n');
console.log(`Wrote ${examples.length} synthetic examples to ${output}`);
