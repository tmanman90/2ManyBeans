import { CoffeeContextCard } from './artifacts/CoffeeContextCard';
import { CurrentRecipeCard } from './artifacts/CurrentRecipeCard';
import { RecipeProposalCard } from './artifacts/RecipeProposalCard';
import { DataGapCard } from './artifacts/DataGapCard';
export function ArtifactRenderer({ artifact, onAction, onSelect }) { if (!artifact) return null; if (artifact.type === 'coffee_context') return <CoffeeContextCard {...artifact} />; if (artifact.type === 'current_recipe') return <CurrentRecipeCard recipe={artifact.recipe || artifact} />; if (artifact.type === 'recipe_proposal') return <RecipeProposalCard proposal={artifact} onAction={onAction} />; if (artifact.type === 'data_gap') return <DataGapCard {...artifact} onSelect={onSelect} />; return null; }
