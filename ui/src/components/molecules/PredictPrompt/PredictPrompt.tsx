import { useState, type ReactNode } from "react";
import { Button } from "../../atoms";
import { SectionLabel, Text, VisuallyHidden } from "../../foundation";
import styles from "./PredictPrompt.module.css";

/**
 * One binary question, asked before the step that would answer it.
 *
 * It costs a line of content and converts instruction-following into
 * model-building. A reader who has *committed to a guess* reads the reveal
 * differently from one who is being told something — and the whole difficulty
 * of teaching this system is that its central ideas sound obvious right up
 * until you predict wrongly about them.
 *
 * The best of the shipped ones is the geom question: "a bar geom needs
 * categories on x, and x is a measurement — does it bucket the numbers for you,
 * or say what is wrong?". Most readers guess bucketing, and the reveal —
 * *guessing would be worse than useless; you would get a chart you had not
 * asked for and could not reason about* — is a design argument for the whole
 * product delivered in one sentence, which lands only because they were wrong.
 *
 * Once answered the options lock. There is no second attempt, because a second
 * attempt turns a prediction into a quiz, and the point was never the score.
 */
export function PredictPrompt({
  question,
  options,
  answer,
  reveal,
}: {
  question: ReactNode;
  options: string[];
  answer: number;
  reveal: ReactNode;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const locked = picked !== null;

  return (
    <div className={styles.prompt}>
      <SectionLabel>Predict — before you look</SectionLabel>
      <Text size="small" prose>
        {question}
      </Text>

      <div className={styles.options} role="group" aria-label="predict the outcome">
        {options.map((option, index) => {
          const right = index === answer;
          const state = !locked
            ? "idle"
            : right
              ? "right"
              : index === picked
                ? "chosen"
                : "other";
          return (
            <Button
              key={option}
              variant="framed"
              disabled={locked}
              className={styles[state]}
              onClick={() => setPicked(index)}
            >
              {option}
              {/*
                A tick, not just a fill. The correct option is filled with the
                ok tone, which a colour-blind reader may not distinguish from
                the pale fill beside it — so the glyph carries the meaning and
                the fill reinforces it (WCAG 1.4.1). The word behind the glyph
                is for a screen reader, which does not see either.
              */}
              {locked && right && (
                <>
                  <span aria-hidden="true"> ✓</span>
                  <VisuallyHidden> (correct)</VisuallyHidden>
                </>
              )}
            </Button>
          );
        })}
      </div>

      {locked && (
        <div className={styles.reveal}>
          <Text size="small" tone="faint" prose>
            {reveal}
          </Text>
        </div>
      )}
    </div>
  );
}
