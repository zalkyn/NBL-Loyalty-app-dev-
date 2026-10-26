import { useNavigate } from "react-router";
import { topicByKey } from "../_content.js";

const MODAL_ID = "guide-modal";

/**
 * "Guide" button for a page header. Opens a modal over the current page with the
 * short version of the topic that explains this page: what it is, the steps for
 * each task, and the common questions. "Open full guide" goes to the whole Feature
 * Guide page, which also has the examples, what customers see, and the other topics.
 *
 * The button and the modal are both direct children of <s-page> (the button goes
 * in its secondary-actions slot), so a page just renders <GuideButton topic="…" />.
 */
export function GuideButton({ topic: topicKey }) {
    const navigate = useNavigate();
    const topic = topicByKey(topicKey);

    return (
        <>
            <s-button slot="secondary-actions" icon="info" command="--show" commandFor={MODAL_ID}>
                Guide
            </s-button>

            <s-modal id={MODAL_ID} heading={`Guide: ${topic.title}`} size="large">
                <s-stack direction="block" gap="base">
                    <s-paragraph>{topic.summary}</s-paragraph>

                    {topic.howTo.length > 0 && (
                        <>
                            <s-heading>How to use it, step by step</s-heading>
                            {topic.howTo.map((task) => (
                                <s-box key={task.title} padding="base" background="subdued" borderRadius="base">
                                    <s-stack direction="block" gap="small">
                                        <s-text type="strong">{task.title}</s-text>
                                        <s-ordered-list>
                                            {task.steps.map((step) => <s-list-item key={step}>{step}</s-list-item>)}
                                        </s-ordered-list>
                                    </s-stack>
                                </s-box>
                            ))}
                        </>
                    )}

                    {topic.faq.length > 0 && (
                        <>
                            <s-heading>Common questions</s-heading>
                            {topic.faq.map((item) => (
                                <s-stack key={item.q} direction="block" gap="small-500">
                                    <s-text type="strong">{item.q}</s-text>
                                    <s-text>{item.a}</s-text>
                                </s-stack>
                            ))}
                        </>
                    )}
                </s-stack>

                <s-button slot="secondary-actions" variant="secondary" command="--hide" commandFor={MODAL_ID}>
                    Close
                </s-button>
                <s-button slot="primary-action" variant="primary" onClick={() => navigate(`/app/guide?topic=${topic.key}`)}>
                    Open full guide
                </s-button>
            </s-modal>
        </>
    );
}
