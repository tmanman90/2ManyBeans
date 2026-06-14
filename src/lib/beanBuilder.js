import { getProfileForRoaster } from './roasterProfiles';
import { parseShelfLifeDays } from './peakStatus';
import { ENRICHABLE_FIELDS } from './beanFields';
import { buildSourceContextHash, normalizeSourceInsights } from './sourceInsights';

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

  for (const key of ENRICHABLE_FIELDS) {
    const val = (fields[key] || '').trim();
    if (val) data[key] = val;
  }

  const sourceInsights = normalizeSourceInsights(fields.sourceInsights);
  if (sourceInsights) {
    data.sourceInsights = sourceInsights;
    data.sourceContextHash = buildSourceContextHash({ ...data, sourceInsights });
  }
  if (fields.storyContextHash) data.storyContextHash = fields.storyContextHash;
  if (fields.storyStatus) data.storyStatus = fields.storyStatus;
  if (fields.storyGeneratedAt) data.storyGeneratedAt = fields.storyGeneratedAt;
  if (fields.storyError) data.storyError = fields.storyError;

  const shelfVal = (fields.shelfLife || '').trim();
  if (shelfVal) data.shelfLife = shelfVal;
  if (fields.enrichedAt) data.enrichedAt = fields.enrichedAt;

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
