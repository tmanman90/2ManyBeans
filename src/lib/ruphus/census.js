export const RUPHUS_CLIENT_COMMAND_CAPABILITIES = Object.freeze([
  'apply_proposal', 'brew_once', 'keep_current', 'start_attempt', 'timer_started',
  'complete_attempt', 'prepare_attempt', 'promote_attempt', 'set_dose',
  'set_aiden_grind', 'set_aiden_link', 'undo_revision', 'replace_active_recipe',
]);

export function ruphusClientVersion() {
  return typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? String(__APP_VERSION__) : 'dev';
}
