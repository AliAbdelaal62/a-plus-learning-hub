'use strict';
// Keep original reference sources unchanged; add the reviewed teacher-payment form to the served page.
function adapt(html,source){const marker='/* ---- Phase 1: data protection';if(html.split(marker).length!==2||!source.includes('function installTeacherPaymentFlow()'))throw Error('Teacher payment form adapter mismatch');return html.replace(marker,source+'\ninstallTeacherPaymentFlow();\n'+marker);}
module.exports={adapt};
