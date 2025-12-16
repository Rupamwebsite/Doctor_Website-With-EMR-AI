#!/usr/bin/env node

/**
 * AI Chat Widget - Quick Test
 * Tests the chat API endpoints
 */

const http = require('http');

const tests = [
    {
        name: 'API Health Check',
        method: 'GET',
        path: '/api/doctors',
        expectedStatus: 200
    },
    {
        name: 'Chat Endpoint Test',
        method: 'POST',
        path: '/api/chat/chat',
        body: {
            message: 'নমস্কার, আপনি কি আছেন?',
            userId: 'test_user_123'
        },
        expectedStatus: 200
    },
    {
        name: 'FAQ Endpoint Test',
        method: 'POST',
        path: '/api/chat/faq',
        body: {
            question: 'কিভাবে অ্যাপয়েন্টমেন্ট বুক করব?'
        },
        expectedStatus: 200
    }
];

function makeRequest(method, path, body, callback) {
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: path,
        method: method,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            callback(null, {
                status: res.statusCode,
                data: data ? JSON.parse(data) : null
            });
        });
    });

    req.on('error', callback);

    if (body) {
        req.write(JSON.stringify(body));
    }
    req.end();
}

console.log('\n🚀 AI Chat Widget - Test Suite\n');
console.log('Testing endpoints at http://localhost:3000\n');

let passed = 0;
let failed = 0;
let completed = 0;

tests.forEach((test, index) => {
    setTimeout(() => {
        console.log(`📝 Test ${index + 1}: ${test.name}`);
        
        makeRequest(test.method, test.path, test.body, (err, result) => {
            completed++;

            if (err) {
                console.log(`   ❌ FAILED: ${err.message}`);
                failed++;
            } else if (result.status === test.expectedStatus) {
                console.log(`   ✅ PASSED: Status ${result.status}`);
                if (result.data) {
                    console.log(`   Data: ${JSON.stringify(result.data).substring(0, 100)}...`);
                }
                passed++;
            } else {
                console.log(`   ❌ FAILED: Expected ${test.expectedStatus}, got ${result.status}`);
                failed++;
            }
            console.log();

            if (completed === tests.length) {
                console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);
                process.exit(failed > 0 ? 1 : 0);
            }
        });
    }, index * 500);
});

// Timeout after 10 seconds
setTimeout(() => {
    console.error('\n⏱️  Test timeout - Server not responding\n');
    process.exit(1);
}, 10000);
