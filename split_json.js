const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync('data/chatbot.json', 'utf8'));

const outDir = 'data/ai-brain';
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

// 1. platform.json
const platformData = {
    platform: data.platform,
    assistant_policy: data.assistant_policy,
    subscription_control: data.subscription_control,
    api_usage_control: data.api_usage_control,
    response_engine: data.response_engine
};
fs.writeFileSync(path.join(outDir, 'platform.json'), JSON.stringify(platformData, null, 2));

// 2. courses.json
fs.writeFileSync(path.join(outDir, 'courses.json'), JSON.stringify(data.courses, null, 2));

// 3. installation.json
fs.writeFileSync(path.join(outDir, 'installation.json'), JSON.stringify(data.installation_guides, null, 2));

// 4. troubleshooting.json
fs.writeFileSync(path.join(outDir, 'troubleshooting.json'), JSON.stringify(data.troubleshooting, null, 2));

// 5. automation_templates.json
fs.writeFileSync(path.join(outDir, 'automation_templates.json'), JSON.stringify(data.automation_templates, null, 2));

// 6. faq_dataset.json
fs.writeFileSync(path.join(outDir, 'faq_dataset.json'), JSON.stringify(data.faq_dataset, null, 2));

// 7. intent_patterns.json
fs.writeFileSync(path.join(outDir, 'intent_patterns.json'), JSON.stringify(data.intent_detection, null, 2));

console.log("Splitting complete!");
