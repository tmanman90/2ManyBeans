# Google Stitch Redesign Plan for Coffee Hub

## Status: Phase 1 Complete (MCP Setup) -- Resume at Phase 2

## What's Done
- Stitch MCP configured in `.mcp.json` with API key (gitignored)
- Research completed and saved to `~/Documents/Last30Days/claude-code-google-stitch-ios-app-redesign.md`

## What's Next

### Phase 2: Extract Existing Design System (~5 min)
1. Go to stitch.withgoogle.com, create a new project
2. Feed it the production URL: `https://2manybeans.vercel.app`
3. Stitch will analyze the live site and extract color palette, type scale, spacing
4. Export the DESIGN.md file
5. Drop DESIGN.md in the project root (next to CLAUDE.md)

### Phase 3: Redesign a Screen in Stitch (~15-30 min)
1. Screenshot the tab you want to redesign (or design a new feature tab)
2. Use Stitch's **Redesign mode**: upload screenshot, prompt for cleaner/more premium version
3. Or use **Voice Canvas** to talk through changes in real-time
4. For a NEW tab: start fresh with a prompt referencing your DESIGN.md
5. Iterate on the canvas until you like it

### Phase 4: Build It in Claude Code (~30-60 min)
1. Pull the design into Claude Code via stitch MCP, or export HTML and drop in project
2. Ask Claude Code to convert the Stitch design into React components
3. **MUST invoke /ios-design** before touching any layout (safe areas, touch targets, keyboard, status bar)
4. Layer on Capacitor-specific patterns (isNative checks, haptics, etc.)
5. Deploy with normal Vercel + Capgo OTA flow

## Key Research Insights
- DESIGN.md is "CLAUDE.md for design" -- captures full design system in AI-readable markdown
- Stitch has a Redesign mode specifically for existing UIs (upload screenshot, reimagine it)
- Stitch can extract design systems from live URLs automatically
- Separate design (Stitch) from code (Claude Code) to avoid "AI slop" look
- Stitch exports web-first HTML/CSS, so iOS-specific patterns (safe areas, touch targets) must be added manually

## Recommendation
Design a NEW feature tab first (lower risk, cleaner test of workflow). If it works well, circle back and use Redesign mode on existing tabs.
