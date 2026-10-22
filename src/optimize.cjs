// SVGO 1.x (reused from local inventory). cleanupIDs disabled: UBERON ids are the selection keys.
const SVGO = require(process.env.SVGO_PATH || 'svgo'); // SVGO 1.x
const fs = require('fs');
const [,, inp, out] = process.argv;
const svgo = new SVGO({
  floatPrecision: 3,
  plugins: [
    { cleanupIDs: false },
    { removeTitle: false },
    { removeDesc: false },
    { removeViewBox: false },
    { collapseGroups: false },
    { removeHiddenElems: false },
    { convertShapeToPath: false },
    { moveElemsAttrsToGroup: false },
    { moveGroupAttrsToElems: false },
    { removeUnknownsAndDefaults: { keepDataAttrs: false, keepRoleAttr: true } },
    { removeDimensions: true },
    { mergePaths: false },
  ],
});
svgo.optimize(fs.readFileSync(inp, 'utf8')).then(r => { fs.writeFileSync(out, r.data); console.log(out, r.data.length); });
