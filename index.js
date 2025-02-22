// request-pr-review
// Copyright (c) 2024-present NAVER Corp.
// Apache-2.0

const core = require("@actions/core");
const axios = require("axios");

const D0 = "D-0";
const ENCODE_PAIR = { "<": "&lt;", ">": "&gt;" };
const encodeText = text => text.replace(/[<>]/g, matched => ENCODE_PAIR[matched]);

// GitHub API 요청 함수
const authFetch = url => axios({
    method: "get",
    headers: {
        Authorization: `token ${core.getInput("token")}`
    },
    url
}).then(res => res.data);

// Slack 메시지 생성 함수
const createRequestPRData = (prs) => ({
    text: "📢 리뷰가 필요한 PR 목록입니다.",
    blocks: [
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: "👋 좋은 아침입니다. 현재 리뷰가 필요한 PR 목록입니다:"
            }
        },
        ...prs.map(({ repo, title, url, labels }) => ({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `• [${repo}] <${url}|${encodeText(title)}>${
                    labels.some(({ name }) => name === D0) ? "\n\t🚨 *긴급 PR (D-0)* 🚨" : ""
                }`
            }
        }))
    ]
});

// Slack 메시지 전송 함수
const sendSlack = async (data) => {
    try {
        const response = await axios({
            method: "post",
            headers: {
                Authorization: `Bearer ${core.getInput("slackBotToken")}`,
                "Content-Type": "application/json"
            },
            url: "https://slack.com/api/chat.postMessage",
            data: {
                channel: "#lucy-test",
                ...data
            }
        });

        core.info(`Slack Response: ${JSON.stringify(response.data, null, 2)}`);
    } catch (error) {
        core.setFailed(`Slack API Error: ${error.message}`);
    }
};

const refineToApiUrl = repoUrl => {
    const enterprise = !repoUrl.includes("github.com");
    const [host, pathname] = repoUrl
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "")
        .split(/\/(.*)/); // github.com/abc/def -> ['github.com', 'abc/def', '']

    if (enterprise) {
        return `https://${host}/api/v3/repos/${pathname}`;
    }

    return `https://api.${host}/repos/${pathname}`;
};

(async () => {
    try {
        const repoUrls = core.getInput("repoUrls").split(",");
        let allPRs = [];

        for (const repoUrl of repoUrls) {
            const BASE_API_URL = refineToApiUrl(core.getInput("repoUrl"));
            core.info(`Fetching PRs for: ${BASE_API_URL}`);

            // PR 목록 가져오기
            const pulls = await authFetch(`${BASE_API_URL}/pulls`);
            core.info(`Found ${pulls.length} PRs for ${repoUrl}`);

            // PR 목록을 저장
            allPRs = allPRs.concat(
                pulls.map(pull => ({
                    repo: repoUrl.split("/").pop(), // 리포지토리 이름 추출
                    title: pull.title,
                    url: pull.html_url,
                    labels: pull.labels
                }))
            );
        }

        // PR이 존재하는 경우에만 Slack 메시지 전송
        if (allPRs.length > 0) {
            core.info("Sending Slack message with all PRs...");
            await sendSlack(createRequestPRData(allPRs));
        } else {
            core.info("No PRs found for review.");
        }

        core.info("Messages sent successfully.");
    } catch (e) {
        core.setFailed(e.message);
    }
})();
