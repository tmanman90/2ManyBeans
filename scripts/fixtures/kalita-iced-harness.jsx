import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HandBrewModal } from '../../src/components/HandBrewModal.jsx';
import { UserPreferencesProvider } from '../../src/hooks/useUserProfile.jsx';
import { generateKalitaRecipe } from '../../src/lib/kalitaAdapter.js';
import { generateKalitaIcedRecipe } from '../../src/lib/kalitaIcedAdapter.js';

const params = new URLSearchParams(location.search);
const size = params.get('size') === '155' ? '155' : '185';
const dose = Number(params.get('dose')) || (size === '155' ? 15 : 20);
const grinder = 'fellow-ode-gen2';
const hot = generateKalitaRecipe({}, { size, dose, grinder });
const preferencesValue = {
  preferences: { grinder, kalitaSize: size, brewMethod: 'kalita', grindSizeDisplay: 'default' },
  updatePreferences: async () => {},
};

function Harness() {
  const [iced, setIced] = useState(() => generateKalitaIcedRecipe({}, { size, dose, grinder }));
  const handleChillingMethodChange = (chillingMethod) => {
    setIced(generateKalitaIcedRecipe({}, { size, dose, grinder, chillingMethod }));
  };
  return (
    <HandBrewModal
      open
      recipe={hot}
      icedRecipe={iced}
      bean={{ id: `fixture-${size}`, name: `Wave ${size} fixture` }}
      deviceKey="kalita"
      userCoffeeGrams={dose}
      onClose={() => {}}
      onCoffeeGramsChange={() => {}}
      onKalitaIcedChillingMethodChange={handleChillingMethodChange}
      onSaveTimingEvent={async () => ({ status: 'saved' })}
    />
  );
}

createRoot(document.getElementById('root')).render(
  <UserPreferencesProvider value={preferencesValue}>
    <Harness />
  </UserPreferencesProvider>,
);
