import { getProfileForRoaster } from './roasterProfiles';
import { parseShelfLifeDays } from './peakStatus';

export function buildNewBeanData(fields, { aidenData, story } = {}) {
  const profile = getProfileForRoaster(fields.roaster);
  const shelfDays = parseShelfLifeDays(fields.shelfLife);
  const peakEnd = shelfDays && shelfDays > profile.peakEnd ? shelfDays : profile.peakEnd;

  const data = {
    roaster: (fields.roaster || '').trim(),
    name: (fields.name || '').trim(),
    origin: (fields.origin || '').trim(),
    variety: (fields.variety || '').trim(),
    process: fields.process || 'Washed',
    roastDate: fields.roastDate || '',
    bagSize: Number(fields.bagSize) || 100,
    status: 'SEALED',
    jarSlot: null,
    openDate: null,
    finishDate: null,
    bagNotes: (fields.bagNotes || '').trim(),
    producer: (fields.producer || '').trim(),
    degasMin: profile.degasMin,
    degasMax: profile.degasMax,
    peakStart: profile.peakStart,
    peakEnd,
    guidance: profile.guidance,
  };

  const enriched = ['altitude', 'region', 'farm', 'roastLevel', 'cupScore',
    'brewingRec', 'sourcedBy', 'shelfLife', 'roastedIn'];
  for (const key of enriched) {
    const val = (fields[key] || '').trim();
    if (val) data[key] = val;
  }

  if (story) data.story = story;

  if (aidenData?.aidenRecipe) {
    data.aidenRecipe = {
      ...aidenData.aidenRecipe,
      generatedAt: aidenData.aidenRecipe.generatedAt || new Date().toISOString(),
    };
    if (aidenData.aidenLink) data.aidenLink = aidenData.aidenLink;
    if (aidenData.aidenGrind) data.aidenGrind = aidenData.aidenGrind;
  }

  return data;
}
