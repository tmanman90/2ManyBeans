import { CurrentRecipeCard } from './artifacts/CurrentRecipeCard';
import { RecipeProposalCard } from './artifacts/RecipeProposalCard';
import { ActionReceiptCard } from './artifacts/ActionReceiptCard';
import { FellowHandoffCard } from './artifacts/FellowHandoffCard';
export function ArtifactRenderer({ artifact, onAction }) { if (!artifact) return null; if (artifact.type === 'current_recipe') return <CurrentRecipeCard recipe={artifact.recipe || artifact} />; if (artifact.type === 'recipe_proposal') return <RecipeProposalCard proposal={artifact} />; if (artifact.type === 'action_receipt' || artifact.type === 'undo_receipt') return <ActionReceiptCard artifact={artifact} onAction={onAction} />; if (artifact.type === 'fellow_handoff_result') return <FellowHandoffCard artifact={artifact} onAction={onAction} />; return null; }
