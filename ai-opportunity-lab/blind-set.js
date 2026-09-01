const {buildAudit}=require('../engine/audit-engine');
const B=[
 {id:'B1',t:'Shift roster gaps',idea:'Our restaurant group juggles rotas for 60 staff. Whenever someone calls in sick the duty manager rings around for an hour finding cover. This happens maybe four times a week. I want something that suggests who to call first.',dec:['PROCEED_TO_PILOT','PREPARE_DEPENDENCIES'],arch:['PREDICTIVE_CLASSICAL_ML','DETERMINISTIC_AUTOMATION','STRUCTURED_AI_WORKFLOW'],gates:[],forbid:[]},
 {id:'B2',t:'Grant eligibility letters',idea:'The system should read each grant application, decide eligibility against the funding rules, and post the outcome letter to the applicant with nobody checking it first.',dec:['HUMAN_LED_DO_NOT_AUTOMATE'],arch:['ASSISTIVE_LLM','STRUCTURED_AI_WORKFLOW','RETRIEVAL_GROUNDED_AI','PREDICTIVE_CLASSICAL_ML'],gates:['HIGH_STAKES_LOW_DETECTABILITY'],forbid:['AGENTIC_SYSTEM']},
 {id:'B3',t:'Tender library lookup',idea:'Bid writers rewrite the same answers for every tender. We keep an approved answer library that the compliance team updates most months, and any reused text has to point back to the approved entry it came from.',dec:['PROCEED_TO_PILOT'],arch:['RETRIEVAL_GROUNDED_AI','ASSISTIVE_LLM'],gates:[],forbid:['AGENTIC_SYSTEM','PROCESS_OR_HUMAN_CHANGE']},
 {id:'B4',t:'Birthday message',idea:'I want AI to write a birthday message for the team channel. There are about twelve birthdays a year and it takes two minutes.',dec:['PARK','USE_SIMPLER_APPROACH'],arch:[],gates:[],forbid:['AGENTIC_SYSTEM','STRUCTURED_AI_WORKFLOW']},
 {id:'B5',t:'Scraped reviews to roadmap tool',idea:'Build an agent that crawls third-party review sites for mentions of our product, works out which complaints are real, and creates tickets in our roadmap tool by itself.',dec:['PREPARE_DEPENDENCIES','HUMAN_LED_DO_NOT_AUTOMATE'],arch:['AGENTIC_SYSTEM','STRUCTURED_AI_WORKFLOW','ASSISTIVE_LLM'],gates:['UNTRUSTED_CONTENT_WITH_TOOL_ACTIONS'],forbid:['PROCESS_OR_HUMAN_CHANGE']},
 {id:'B6',t:'Handover notes',idea:'Nurses hand over at shift change and things get missed. We think an AI could summarise the notes. We have not measured how often anything is actually missed and we do not know if we are allowed to process the notes at all.',dec:['VALIDATE_VALUE','PREPARE_DEPENDENCIES'],arch:['ASSISTIVE_LLM','PROCESS_OR_HUMAN_CHANGE'],gates:['SENSITIVE_DATA_CONTROLS_UNKNOWN'],forbid:['AGENTIC_SYSTEM']},
 {id:'B7',t:'Stock reorder trigger',idea:'When a SKU drops below its reorder point, raise a purchase order at the default supplier using the standard template. It happens around 200 times a month and a clerk does it by hand.',dec:['USE_SIMPLER_APPROACH','PROCEED_TO_PILOT'],arch:['DETERMINISTIC_AUTOMATION'],gates:[],forbid:['AGENTIC_SYSTEM','ASSISTIVE_LLM']},
 {id:'B8',t:'Vague ambition',idea:'We should probably do something with AI this year.',dec:['INSUFFICIENT_INPUT','VALIDATE_VALUE'],arch:[],gates:[],forbid:['AGENTIC_SYSTEM','STRUCTURED_AI_WORKFLOW','RETRIEVAL_GROUNDED_AI']}
];
let pd=0,pa=0,pg=0,pf=0,all=0;
console.log('ID  Case                     | decision                    | architecture              | gates');
console.log('-'.repeat(118));
for(const b of B){
 const a=buildAudit({initial_idea:b.idea});
 const A=a.architecture.best_current_fit, G=a.risk_and_governance.hard_gates;
 const dOK=b.dec.includes(a.decision.state);
 const aOK=b.arch.length? b.arch.includes(A) : (A==null||['VALIDATE_VALUE','PARK','INSUFFICIENT_INPUT'].includes(a.decision.state));
 const gOK=b.gates.every(g=>G.includes(g));
 const fOK=!b.forbid.includes(A);
 pd+=dOK;pa+=aOK;pg+=gOK;pf+=fOK; if(dOK&&aOK&&gOK&&fOK)all++;
 console.log(`${b.id}  ${b.t.padEnd(24)}| ${(a.decision.state+(dOK?' .':' X')).padEnd(28)}| ${(String(A)+(aOK?' .':' X')).padEnd(26)}| ${(G.join(',')||'none')}${gOK?'':' X'}${fOK?'':' [FORBIDDEN ARCH]'}`);
}
console.log('-'.repeat(118));
console.log(`decision ${pd}/8  architecture ${pa}/8  gates(safe) ${pg}/8  forbidden ${pf}/8  ALL ${all}/8`);
