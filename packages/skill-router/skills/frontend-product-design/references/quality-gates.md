# Product UI Quality Gates

Reject delivery when any critical gate fails.

## 1. Product and hierarchy

- A user can identify the page, current state, and primary action within five seconds.
- The first viewport has one dominant idea; routine app screens begin with the working surface.
- Headings alone form a coherent outline.
- Repeated explanations, decorative labels, and non-actionable panels are removed.

## 2. Composition and originality

- Cards express real grouping or interaction, not default decoration.
- At least one meaningful layout device exists beyond a centered container plus card grid.
- Typography, spacing, imagery, and alignment carry more hierarchy than shadows and gradients.
- The result is consistent with the product, not an imitation of a referenced brand.

## 3. Interaction completeness

- Primary controls have hover, active, focus, disabled, loading, success, and error behavior where relevant.
- Destructive actions communicate consequence and confirmation.
- Motion has a named purpose and does not slow frequent actions.
- Keyboard navigation and focus order are usable.

## 4. Responsive behavior

- Inspect at a desktop width and near 390px.
- No unintended horizontal scrolling, clipped controls, overlapping text, or inaccessible off-canvas navigation.
- Tables and dense data use an explicit small-screen strategy rather than blind stacking.
- Touch targets are at least 44px where touch interaction is expected.

## 5. Accessibility and performance

- Normal text contrast targets 4.5:1; state is not conveyed by color alone.
- Inputs have visible labels; icon-only controls have accessible names.
- Images have appropriate alternatives and reserved dimensions.
- Reduced motion is supported; animations primarily use transform/opacity.
- Loading does not cause avoidable layout shift.

## 6. Evidence

- Run tests, type checks, lint, and the production build supported by the repository.
- Inspect representative routes in a real browser and check console errors.
- Report what was inspected and any remaining limitation; never call an unrendered implementation visually complete.
