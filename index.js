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
    headers: { Authorization: `token ${core.getInput("token")}` },
    url
}).then(res => res.data);

// Slack 메시지 생성 함수 (모든 PR을 하나의 메시지로 합침)
const createRequestPRData = (prs) => {
    const repoGroups = new Map();
    prs.forEach(({ repo, title, url, labels }) => {
        if (!repoGroups.has(repo)) repoGroups.set(repo, []);
        repoGroups.get(repo).push({ title, url, labels });
    });

    return {
        text: "👋 좋은 아침입니다!\n🙏 리뷰를 애타게 기다리는 동료의 PR이 있어요. 리뷰에 참여해 주세요:",
        blocks: [
            {
                type: "section",
                text: { type: "mrkdwn", text: "👋 좋은 아침입니다!\n리뷰를 애타게 기다리는 동료의 PR이 있어요. 리뷰에 참여해 주세요.😃\n" }
            },
            ...[...repoGroups.entries()].flatMap(([repo, prList]) => [
                {
                    type: "section",
                    text: { type: "mrkdwn", text: `📌 *${repo}*` }
                },
                ...prList.map(({ title, url, labels }) => ({
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `• <${url}|${encodeText(title)}>${
                            labels.some(({ name }) => name === D0) ? "\n\t☝️ PR은 \`${D0}\`로 긴급한 PR입니다. 🚨 지금 바로 리뷰에 참여해 주세요. 🚨" : ""
                        }`
                    }
                }))
            ])
        ]
    };
};

// Slack 메시지 전송 함수
const sendSlack = async (data) => {
    try {
        await axios({
            method: "post",
            headers: {
                Authorization: `Bearer ${core.getInput("slackBotToken")}`,
                "Content-Type": "application/json"
            },
            url: "https://slack.com/api/chat.postMessage",
            data: { channel: "#lucy-test", ...data }
        });
    } catch (error) {
        core.setFailed(`Slack API Error: ${error.message}`);
    }
};

// GitHub API URL 변환 함수
const refineToApiUrl = repoUrl => {
    const pathname = repoUrl.replace(/^https?:\/\//, "").replace(/\/$/, "").split(/\/(.*)/)[1];
    return `https://api.github.com/repos/${pathname}`;
};

(async () => {
    try {
        // ✅ 여러 개의 repoUrl을 한 번에 처리
        const repoUrls = core.getInput("repoUrls").split(",").map(url => url.trim());
        let allPRs = [];

        for (const url of repoUrls) {
            const repoUrl = core.getInput("repoUrl")
            const BASE_API_URL = refineToApiUrl(repoUrl);
            core.info(`Fetching PRs for: ${BASE_API_URL}`);

            // PR 목록 가져오기
            const pulls = await authFetch(`${BASE_API_URL}/pulls`);
            core.info(`Found ${pulls.length} PRs for ${repoUrl}`);

            // PR 목록을 저장
            allPRs = allPRs.concat(
                pulls.map(pull => ({
                    repo: repoUrl.split("/").slice(-1)[0],
                    title: pull.title,
                    url: pull.html_url,
                    labels: pull.labels
                }))
            );
        }

        // ✅ PR이 하나라도 존재하면 한 번만 Slack 메시지 전송
        if (allPRs.length > 0) {
            core.info("Sending Slack message with all PRs...");
            const message = createRequestPRData(allPRs)
            core.info(`Slack message\n${JSON.stringify(message, null, 2)}`);
            await sendSlack(createRequestPRData(allPRs));
        } else {
            core.info("No PRs found for review.");
        }

        core.info("Messages sent successfully.");
    } catch (e) {
        core.setFailed(e.message);
    }
})();
