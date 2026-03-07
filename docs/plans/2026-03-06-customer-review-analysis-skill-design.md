# Customer Review Analysis Skill Design

## Goal

Create a reusable Codex skill that analyzes tab-delimited customer review `.txt` files and writes a Markdown insight report. The skill must keep all deterministic work in code instead of asking the model to count, rank, or filter records manually.

## Input Assumptions

- The input is a `.txt` file.
- The first row is a header row.
- Columns are separated by tabs.
- The file contains 9 columns in this order:
  1. `品类组`
  2. `品类`
  3. `子品类`
  4. `货号`
  5. `评论内容`
  6. `评论种类`
  7. `一级分类`
  8. `二级分类`
  9. `三级分类`
- The file encoding may vary, so the script should try common Chinese encodings.

## Skill Structure

- `C:\Users\Charl\.codex\skills\customer-review-analysis\SKILL.md`
  - Define trigger conditions and workflow.
  - Instruct Codex to call the bundled script for all statistics.
- `C:\Users\Charl\.codex\skills\customer-review-analysis\scripts\analyze_reviews.py`
  - Parse the input file.
  - Validate headers and row width.
  - Compute the required aggregations.
  - Write the Markdown report.

## Report Structure

1. Report overview
   - Input file name
   - Row count
   - Subcategory count
   - Product count
   - Bad review count
2. Step 1: 子品类维度分析
   - Table of subcategories with review count, distinct secondary-category count, and top 3 `二级分类`
   - Rule-based interpretation of concentration and diversity
3. Step 2: 单品维度分析
   - Table of products with more than 20 bad reviews
   - Table of top 10 products by bad-review count with top 3 bad-review `二级分类`
   - Rule-based interpretation of key problem products and top issue categories
4. Method note
   - Explain assumptions and counting rules

## Decisions

- Use Python standard library only.
- Keep thresholds configurable in the script, but default to:
  - `差评 > 20`
  - `差评前 10 货号`
- Save the output report next to the input file by default using the suffix `.review-analysis.md`.
- Keep interpretations concise and derived from computed metrics only.
