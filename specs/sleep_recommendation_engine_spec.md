# Sleep Recommendation Engine Spec

## Goal

Define how the sleep app should generate **personalized, safe, and practical sleep recommendations** for a baby based on the baby's recent sleep history, current age, and age-appropriate sleep guidance.

This spec is focused on producing recommendations for:
- the next nap
- the rest of the current day
- bedtime
- nap caps
- safe wake window adjustments

---

## Core Principles

1. **Personalized over generic**
   - Recommendations should not rely only on age-based wake windows.
   - They should be informed by the baby's own recent patterns and best-performing days.

2. **Data-informed, not purely reactive**
   - The engine should analyze recent sleep data over a rolling window rather than basing recommendations on a single day.

3. **Use both positive and negative signals**
   - The engine should learn from the baby's best sleep days and worst sleep days.

4. **Safety and realism first**
   - Recommendations must pass guardrails so the app does not suggest unrealistic or harmful schedules.

5. **Return a full-day plan**
   - The engine should not only recommend the next step.
   - It should construct the likely shape of the rest of the day, including nap caps and bedtime.

---

## Inputs

The engine should use the following inputs:

### Baby profile
- age in days
- age in weeks
- age in months
- optional developmental flags if available

### Sleep data window
- last 30 days of sleep data
- all naps
- bedtime
- overnight sleep
- wake times
- false starts
- overnight wakes
- early morning wakes
- total daytime sleep
- total nighttime sleep
- number of naps
- wake window lengths

### Current day state
- wake time today
- naps completed today
- current time
- current awake duration
- sleep accumulated so far today
- whether the current recommendation is for:
  - next nap
  - rest of day
  - bedtime only

### Reference guidance
- age-based recommended wake windows
- age-based nap count expectations
- age-based bedtime range if available
- age-based max single wake window ceilings
- age-based nap cap guidance if available

---

## Step 1: Build the 30-Day Analysis Set

Analyze the baby's last 30 days of usable sleep data.

### Include
- only days with enough data to evaluate meaningfully
- days with known wake time and bedtime
- days with enough nap data to calculate wake windows

### Exclude or downweight
- incomplete days
- sick days if tagged
- travel days if tagged
- days with unusual disruptions if tagged
- days with missing bedtime or unclear nap structure

### Recommended improvement
Instead of treating all 30 days equally, apply **recency weighting**:
- last 7 days = highest weight
- days 8-14 = medium weight
- days 15-30 = lower weight

This helps recommendations adapt while still using enough history.

---

## Step 2: Rank Days by Sleep Score

Take the last 30 days and rank them using the baby's sleep score.

### Select
- top 5 highest-scoring days
- bottom 5 lowest-scoring days

If fewer than 10 usable days exist:
- use what is available
- require at least 3 usable days before making a strong personalized recommendation
- otherwise fall back more heavily to age-based guidance

### Why
This allows the engine to compare:
- what tends to happen on the baby's best days
- what tends to happen on the baby's worst days

---

## Step 3: Extract Trends from Best and Worst Days

For both the **top 5** and **bottom 5** days, extract and summarize patterns.

### Metrics to compare
- wake window 1 length
- wake window 2 length
- wake window 3 length
- final wake window length
- bedtime
- number of naps
- nap 1 duration
- nap 2 duration
- nap 3 duration
- total daytime sleep
- time of first nap
- time of last nap
- longest nap timing
- nap distribution across the day
- overnight wake count
- false start frequency
- total 24-hour sleep if available

### Pattern detection
Identify:
- averages
- medians
- ranges
- clusters
- values that differ meaningfully between best and worst days

### Example insights
- best days tend to have a wake window 1 between 2h10m and 2h25m
- worst days often happen when wake window 2 exceeds 3h00m
- best days usually have bedtime between 7:05 PM and 7:35 PM
- false starts increase when total daytime sleep exceeds 3h30m
- best days usually have 2 naps, worst days often have a forced late third cat nap

### Recommended improvement
Do not only compare raw averages. Also identify:
- **most predictive ranges**
- **thresholds that correlate with poor outcomes**
- **tolerance bands** for each variable

This makes the engine more useful than simply averaging.

---

## Step 4: Retrieve Age-Based Guidance

Get the recommended wake windows and schedule expectations for the baby's age.

### Retrieve
- recommended wake window range by wake window number
- recommended number of naps
- typical total daytime sleep range
- typical bedtime range if available
- max final wake window
- earliest and latest reasonable bedtime bounds for age

### Use this as
- a baseline
- a safety constraint
- a fallback when user data is sparse or noisy

### Important rule
The app should not blindly apply age norms if the baby's own data shows a clearly better pattern that is still safe and reasonable.

---

## Step 5: Generate the Personalized Recommendation

Combine:
1. the baby's top-performing trends
2. the baby's low-performing trends to avoid
3. age-based wake window guidance
4. the baby's current day state

### Decision logic
The recommendation engine should:
- prefer patterns seen on the baby's top days
- avoid patterns associated with the baby's bottom days
- stay within age-appropriate boundaries
- adjust based on how today's naps actually unfolded

### Recommendation outputs should include
- recommended next sleep time
- recommended target wake window
- recommended nap cap
- estimated length of the next nap
- recommended bedtime
- recommended remaining schedule for the day
- explanation of why this recommendation was chosen

### Example reasoning
- the baby performs best with a shorter first wake window than the age average
- the baby has more false starts when the final wake window is too long
- today's first two wake windows are already stretched
- therefore the app should shorten the next wake window and preserve bedtime within the preferred range

---

## Step 6: Construct the Rest-of-Day Plan

After generating the recommendation, the engine should build the rest of the day.

### The plan should include
- next nap start target
- next nap cap
- whether another nap is needed after that
- target final wake window
- target bedtime
- acceptable flexibility window around each time

### The plan should account for
- how much daytime sleep has already happened
- the baby's usual successful nap count
- age-appropriate nap transitions
- avoiding a bedtime that is too early or too late
- preventing unrealistic schedule drift

### Example outputs
- nap 3: offer at 4:10 PM, cap at 20 minutes
- bedtime: 7:18 PM
- if nap is skipped, move bedtime earlier to 6:45-7:00 PM

### Recommended improvement
Return both:
- a **primary plan**
- a **fallback plan**

This is useful because baby sleep is variable.

Example:
- Plan A: if next nap happens
- Plan B: if next nap is refused or too short

---

## Step 7: Validate Every Proposed Wake Window and Bedtime

Before returning any recommendation, run a validation pass.

### Validate against age-based bounds
Check that:
- no wake window is too short to be realistic
- no wake window is too long for the baby's age
- bedtime is within acceptable age-based bounds
- nap count is developmentally reasonable
- total daytime sleep is not excessively high or low
- final wake window is not extreme

### Validate against user-pattern bounds
Check that:
- the proposed schedule does not conflict sharply with the baby's successful patterns
- the recommendation does not recreate conditions often seen on low-score days
- bedtime is not far outside the baby's historically successful range unless necessary

### Examples of invalid outputs
- 4:00 PM bedtime unless there is an exceptional edge case
- 5-hour wake window when the baby typically succeeds with 2.5 to 3 hours
- recommending 4 naps for a baby who has clearly transitioned to 2 naps
- allowing a late cat nap that pushes bedtime too late

---

## Step 8: Make Adjustments

If the proposed schedule fails validation, adjust it automatically.

### Adjustment order
1. adjust nap cap
2. adjust next nap start slightly earlier or later
3. remove an unnecessary nap
4. shorten the final wake window
5. bring bedtime back into acceptable range
6. fall back closer to age-based guidance if the personalized plan remains invalid

### Adjustment philosophy
Use the smallest adjustment that produces a safe, realistic recommendation.

### Important rule
Do not return a recommendation that violates hard safety or realism constraints.

---

## Step 9: Return the Results

Return the final recommendation in a structured format.

## Suggested response shape

```json
{
  "summary": {
    "recommendation_type": "rest_of_day",
    "confidence": "high",
    "primary_driver": "baby performs best with earlier bedtime and moderate final wake window"
  },
  "analysis": {
    "days_analyzed": 24,
    "top_days_considered": 5,
    "bottom_days_considered": 5,
    "age_guidance_used": {
      "wake_window_1": "2h15m-2h30m",
      "wake_window_2": "2h30m-2h45m",
      "final_wake_window": "2h45m-3h00m"
    },
    "personal_patterns": {
      "best_day_trends": [],
      "worst_day_trends": [],
      "key_thresholds": []
    }
  },
  "recommendation": {
    "next_sleep_time": "2026-04-13T15:55:00",
    "target_wake_window_minutes": 160,
    "nap_cap_minutes": 30,
    "expected_nap_length_minutes": 25,
    "recommended_bedtime": "2026-04-13T19:12:00"
  },
  "rest_of_day_plan": {
    "plan_a": [],
    "plan_b": []
  },
  "validation": {
    "passed": true,
    "adjustments_made": [],
    "guardrails_checked": []
  },
  "explanation": [
    "The baby tends to score best with a bedtime between 7:00 PM and 7:30 PM.",
    "Long final wake windows were associated with false starts on lower-scoring days.",
    "Today's sleep so far supports a short capped final nap and a normal bedtime."
  ]
}
```

---

## Recommended Scoring and Confidence Model

The engine should attach a confidence level to each recommendation.

### Confidence should increase when
- enough usable days exist
- recent data is consistent
- best-day patterns are clear
- current day follows predictable structure
- age-based guidance and user history align

### Confidence should decrease when
- the last 30 days are noisy
- there are too many outlier days
- recent sleep has been inconsistent
- the baby is in a nap transition
- there is insufficient data
- current day is already off-pattern

### Suggested confidence buckets
- high
- medium
- low

---

## Guardrails

These should be enforced before returning the result.

### Hard guardrails
- do not recommend biologically unrealistic wake windows
- do not recommend an extremely early bedtime except in legitimate edge cases
- do not recommend a bedtime far outside normal bounds for age without explanation
- do not recommend a schedule that creates impossible nap spacing
- do not recommend total daytime sleep that clearly exceeds the baby's successful range without a reason

### Soft guardrails
- prefer the baby's historically successful bedtime window
- prefer wake windows near successful tolerance bands
- avoid schedule jumps that are too abrupt from the current day
- avoid suggesting a late nap that predictably causes bedtime resistance or false starts

---

## Edge Cases

The engine should explicitly handle:

### Sparse data
- fewer than 3 good days: rely mostly on age guidance
- 3 to 7 good days: use blended personalization
- 8 or more good days: stronger personalization

### Sick days
- exclude or heavily downweight if tagged

### Travel or disrupted days
- exclude or heavily downweight if tagged

### Nap transition periods
- allow wider tolerance bands
- lower confidence
- return fallback plans more often

### Short naps all day
- construct recovery options
- consider micro-nap or early bedtime branches

### Missed last nap
- automatically branch into an early bedtime scenario

### Excessive daytime sleep
- use tighter nap caps later in the day
- preserve bedtime if possible

---

## Recommended Enhancements

These would make the recommendation engine better than the original TL;DR.

### 1. Compare top and bottom days, not just summarize them
This helps identify what to do and what to avoid.

### 2. Use medians and ranges, not only averages
Baby sleep is noisy. Medians are more robust.

### 3. Add recency weighting
Recent data should matter more than data from 3 to 4 weeks ago.

### 4. Return both a primary plan and fallback plan
This is important because naps are unpredictable.

### 5. Add confidence scoring
The UI should communicate whether a recommendation is strong or tentative.

### 6. Support tagged-day exclusions
Sick, travel, teething, or unusually disrupted days should not distort recommendations.

### 7. Store explainability metadata
The app should be able to explain exactly why it suggested a schedule.

---

## Final Decision Framework

The engine should use this hierarchy when making decisions:

1. hard safety and realism guardrails
2. current day constraints
3. baby's best-performing historical patterns
4. patterns associated with poor sleep to avoid
5. age-based recommended wake windows
6. fallback logic when data is weak or inconsistent

---

## One-Sentence Product Definition

The sleep recommendation engine should use the baby's recent sleep history plus age-appropriate guidance to generate a personalized, validated, and explainable plan for the rest of the day that stays within safe and realistic bounds.
