'use strict';
const fs = require('fs');
const path = require('path');

// The ONLY write path the dashboard has. It creates one inbox message and nothing
// else: never kanban.md, never team.md, never a source file. The Manager applies
// the request on its next pass, so the board keeps a single writer.
function writeDodCheck({ projectDir, cardId, index, checked, boxText, now }) {
  if (!projectDir || !cardId || !Number.isInteger(index)) {
    throw new Error('projectDir, cardId and an integer index are required');
  }
  const inbox = path.join(projectDir, '.sdlc', 'inbox');
  const resolved = path.resolve(inbox);
  if (!resolved.startsWith(path.resolve(projectDir, '.sdlc'))) {
    throw new Error('refusing to write outside .sdlc/inbox');
  }
  fs.mkdirSync(inbox, { recursive: true });

  const stamp = (now || new Date().toISOString()).replace(/\.\d+Z$/, 'Z');
  const safeStamp = stamp.replace(/:/g, '-');
  const file = path.join(inbox, `${safeStamp}_HUMAN_${cardId}.md`);
  const verb = checked ? 'check' : 'uncheck';
  const body = `---
from: Human
task: ${cardId}
type: dod-check
timestamp: ${stamp}
---
## Summary
The human ${checked ? 'ticked' : 'un-ticked'} definition-of-done box ${index + 1}${boxText ? ` ("${boxText}")` : ''} on ${cardId} from the dashboard.

## Requested board changes
- ${verb} DoD box ${index + 1} on ${cardId}

## Notes for others
(none)

## New task proposals
(none)
`;
  fs.writeFileSync(file, body);
  return file;
}

module.exports = { writeDodCheck };
