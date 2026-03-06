const fs = require('fs');
const https = require('https');
const http = require('http');

async function checkUrl(urlStr) {
    return new Promise((resolve) => {
        const parsed = new URL(urlStr);
        const client = parsed.protocol === 'https:' ? https : http;
        const req = client.get(urlStr, { timeout: 5000 }, (res) => {
            // 2xx or 3xx are fine
            if (res.statusCode >= 200 && res.statusCode < 400) {
                resolve({ url: urlStr, status: res.statusCode, ok: true });
            } else {
                resolve({ url: urlStr, status: res.statusCode, ok: false });
            }
            res.destroy();
        }).on('error', (err) => {
            resolve({ url: urlStr, status: 'ERROR', ok: false, error: err.message });
        }).on('timeout', () => {
            req.destroy();
            resolve({ url: urlStr, status: 'TIMEOUT', ok: false });
        });
    });
}

async function run() {
    console.log('--- Checking AI Learning Hub Links ---');
    const hubData = JSON.parse(fs.readFileSync('data/ai_learning_hub_dataset.json', 'utf8'));
    let hubPass = 0, hubTotal = 0;

    for (const path of hubData.learning_paths) {
        for (const course of path.courses) {
            if (course.course_url) {
                hubTotal++;
                const res = await checkUrl(course.course_url);
                console.log(`[${res.ok ? 'OK' : 'FAIL'}] Course URL (${res.status}): ${res.url}`);
                if (res.ok) hubPass++;
            }
            if (course.video_url) {
                hubTotal++;
                const res = await checkUrl(course.video_url);
                console.log(`[${res.ok ? 'OK' : 'FAIL'}] Video URL (${res.status}): ${res.url}`);
                if (res.ok) hubPass++;
            }
        }
    }

    console.log(`\n--- Checking AI Training Tools Links ---`);
    const toolsData = JSON.parse(fs.readFileSync('data/AI Training Tools.json', 'utf8'));
    let toolsPass = 0, toolsTotal = 0;

    for (const tool of toolsData.tools) {
        if (tool.download_url) {
            toolsTotal++;
            const res = await checkUrl(tool.download_url);
            console.log(`[${res.ok ? 'OK' : 'FAIL'}] Download URL (${res.status}): ${res.url}`);
            if (res.ok) toolsPass++;
        }
    }

    console.log(`\nSummary:`);
    console.log(`AI Learning Hub: ${hubPass}/${hubTotal} passed.`);
    console.log(`AI Training Tools: ${toolsPass}/${toolsTotal} passed.`);
}

run().catch(console.error);
