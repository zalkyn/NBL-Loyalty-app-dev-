/**
 * @file guide/route.jsx
 * @description Feature Guide — every feature explained in plain words, with a
 * worked example, things to watch for, and the questions admins actually ask.
 * One topic at a time (?topic=referrals), so a "Guide" button on any page can
 * open exactly the right explanation.
 *
 *   _content.js            -> the text (data only; keep in step with the code)
 *   components/GuideButton -> the header button other pages use
 */

import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "shopify-server";

import { GUIDE_TOPICS, DEFAULT_TOPIC, topicByKey } from "./_content.js";

export const loader = async ({ request }) => {
    await authenticate.admin(request);
    const asked = new URL(request.url).searchParams.get("topic") ?? DEFAULT_TOPIC;
    return { topic: topicByKey(asked).key };
};

function Steps({ steps }) {
    return (
        <s-ordered-list>
            {steps.map((step) => <s-list-item key={step}>{step}</s-list-item>)}
        </s-ordered-list>
    );
}

export default function GuidePage() {
    const { topic: topicKey } = useLoaderData();
    const navigate = useNavigate();
    const topic = topicByKey(topicKey);
    const index = GUIDE_TOPICS.findIndex((t) => t.key === topic.key);
    const prev = GUIDE_TOPICS[index - 1];
    const next = GUIDE_TOPICS[index + 1];
    const go = (key) => navigate(`/app/guide?topic=${key}`);

    return (
        <s-page heading="Feature Guide">
            <s-section heading="Choose a feature">
                <s-stack direction="inline" gap="small">
                    {GUIDE_TOPICS.map((t) => (
                        <s-button key={t.key} size="small" variant={t.key === topic.key ? "primary" : "secondary"} onClick={() => go(t.key)}>
                            {t.title}
                        </s-button>
                    ))}
                </s-stack>
            </s-section>

            <s-section heading={topic.title}>
                <s-stack direction="block" gap="base">
                    <s-paragraph>{topic.summary}</s-paragraph>
                    {topic.where && (
                        <s-stack direction="inline">
                            <s-button variant="secondary" href={topic.where.href}>{topic.where.label}</s-button>
                        </s-stack>
                    )}
                </s-stack>
            </s-section>

            <s-section heading="How it works">
                <Steps steps={topic.steps} />
            </s-section>

            {topic.moreSteps.length > 0 && (
                <s-section heading="More detail">
                    <Steps steps={topic.moreSteps} />
                </s-section>
            )}

            {topic.customerSees.length > 0 && (
                <s-section heading="What your customers see">
                    <s-unordered-list>
                        {topic.customerSees.map((line) => <s-list-item key={line}>{line}</s-list-item>)}
                    </s-unordered-list>
                </s-section>
            )}

            {topic.examples.length > 0 && (
                <s-section heading={topic.examples.length > 1 ? "Examples" : "Example"}>
                    <s-stack direction="block" gap="base">
                        {topic.examples.map((example) => (
                            <s-box key={example.title} padding="base" background="subdued" borderRadius="base">
                                <s-stack direction="block" gap="small">
                                    <s-text type="strong">{example.title}</s-text>
                                    {example.lines.map((line) => <s-text key={line}>{line}</s-text>)}
                                </s-stack>
                            </s-box>
                        ))}
                    </s-stack>
                </s-section>
            )}

            {topic.notes?.length > 0 && (
                <s-section heading="Good to know">
                    <s-stack direction="block" gap="base">
                        {topic.notes.map((note) => (
                            <s-banner key={note.text} tone={note.tone}>
                                <s-text>{note.text}</s-text>
                            </s-banner>
                        ))}
                    </s-stack>
                </s-section>
            )}

            {topic.faq?.length > 0 && (
                <s-section heading="Common questions">
                    <s-stack direction="block" gap="base">
                        {topic.faq.map((item) => (
                            <s-stack key={item.q} direction="block" gap="small-500">
                                <s-text type="strong">{item.q}</s-text>
                                <s-text>{item.a}</s-text>
                            </s-stack>
                        ))}
                    </s-stack>
                </s-section>
            )}

            <s-section>
                <s-stack direction="inline" gap="small" justifyContent="space-between">
                    {prev ? <s-button variant="secondary" onClick={() => go(prev.key)}>← {prev.title}</s-button> : <span />}
                    {next ? <s-button variant="secondary" onClick={() => go(next.key)}>{next.title} →</s-button> : <span />}
                </s-stack>
            </s-section>
        </s-page>
    );
}
