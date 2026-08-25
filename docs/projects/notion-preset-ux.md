# ClipNest Notion Preset UX

Status: Planned

## Goal

Redesign the ClipNest Notion experience around presets.

A preset is a complete clipping configuration:

- Notion workspace
- destination page or database
- visible fields
- Notion property mappings
- field order
- default values
- hidden or fixed values
- clipping behavior

The Notion tab should begin with a list of presets every time.

The user chooses the preset that matches where and how the current webpage should be saved.

## Core principle

Do not auto-open the last-used preset.

Opening the Notion tab should always show the preset chooser.

Flow:

Notion tab
→ Choose preset
→ Fill preset-specific fields
→ Save to Notion

Secondary flows:

Preset chooser
→ New preset

Selected preset
→ Edit preset

Edit preset
→ Choose destination

## Terminology

Use:

- Preset
- New preset
- Edit preset
- Choose preset
- Destination
- Workspace
- Fields

Do not use "Form" as the ClipNest terminology.

## View 1 - Preset chooser

This is the default Notion screen.

Example:

    ClipNest

    [ Obsidian ] [ Notion ]

    Choose preset

    ┌─────────────────────────────────┐
    │ vid                           › │
    │ INBOX · gerainchick              │
    └─────────────────────────────────┘

    ┌─────────────────────────────────┐
    │ Newsletter                    › │
    │ Newsletter Pipeline · gerainchick│
    └─────────────────────────────────┘

    ┌─────────────────────────────────┐
    │ Library                       › │
    │ My Library · Alex G's Notion    │
    └─────────────────────────────────┘

    + New preset

Requirements:

- Show all presets.
- Each preset is a large clickable row/card.
- Show preset name prominently.
- Show destination and workspace as secondary information.
- Clicking a preset opens its clipping screen.
- No preset dropdown on the clipping screen.
- New preset is available directly from this screen.
- General Settings remains available.

## View 2 - Preset clipping screen

Each preset renders its own fields.

Header:

    ‹        Preset Name        ⚙

Behavior:

- Back returns to the preset chooser.
- Gear edits the current preset.
- Save button remains visible at the bottom.
- The page title and current URL may be used as field defaults when mapped.

Example preset: vid

    ‹        vid                ⚙

    Title
    [ Page title ]

    Tags
    [ now × ] [ then × ] |

    + Add note

    Content
    [ Article ] [ Area ]

    [        Save to Notion        ]

Example preset: Newsletter

    ‹      Newsletter           ⚙

    Type
    [ Empty ▼ ]

    Pipeline
    [ Empty ▼ ]

    Title
    [ Page title ]

    Status
    [ Empty ▼ ]

    Notes
    [ ... ]

    [        Save to Notion        ]

Example preset: Library

    ‹        Library            ⚙

    Title
    [ Page title ]

    Image
    [ preview ] [+]

    URL
    [ current URL ]

    Author
    [ Empty ]

    Status
    [ Empty ▼ ]

    [        Save to Notion        ]

## Preset-driven field renderer

The clipping screen must not hard-code:

- Title
- Tags
- URL
- Notes

Instead, render fields from the selected preset configuration.

A preset field definition should eventually support:

- Notion property ID
- Notion property name
- property type
- display label
- field order
- visible in clipper
- default value
- fixed value
- source value
- required state

Possible source values:

- page title
- page URL
- selected text
- article content
- main image
- screenshot
- manual input
- fixed preset value

## Property types

Initial renderer:

- title
- url
- multi_select

Next:

- select
- status
- rich_text
- checkbox
- date
- number

Later:

- files / images
- people
- relation
- multi-source content fields

## Multi-select behavior

Keep the Notion tag work already implemented:

- pull existing options from Notion
- preserve Notion colors
- selected options become colored chips
- create new options
- deterministic color for new options
- narrow scrollable picker
- click outside closes picker

Generalize this component later so it can be used by any multi-select property, not only a property named Tags.

## View 3 - Edit preset

Example:

    ‹        Edit preset

    Preset name
    [ vid ]

    Workspace
    [ gerainchick ▼ ]

    Destination
    [ INBOX                  › ]

    Fields

    ≡ Name
      Title
      Source: Page title

    ≡ Tags
      Multi-select
      Source: Manual

    ≡ URL
      URL
      Source: Page URL

    [ + Add field ]

    [ Save preset ]

Requirements:

- Rename preset.
- Change workspace.
- Change destination.
- Configure visible fields.
- Reorder fields.
- Remove fields from clipper.
- Configure source/default values.
- Preserve mappings by Notion property ID.

## View 4 - Choose destination

Dedicated destination screen.

Example:

    ‹        Choose destination

    Workspace
    [ gerainchick ▼ ]

    [ Search databases and pages... ]

    Databases

    ▣ INBOX

    🍴 Recipes
      PARA / Resources / Cooking

    ▤ Subscriptions
      PARA / Areas / Finances

    Pages

    📄 Prompts Database
      PARA / Resources

Requirements:

- Reuse existing workspace discovery.
- Reuse existing private Notion destination search.
- Reuse icons and breadcrumbs.
- Search databases and pages.
- Selecting a destination returns to Edit preset.
- Do not embed the large destination browser permanently in Settings.

## View 5 - New preset

Flow:

New preset
→ choose name
→ choose workspace
→ choose destination
→ load schema
→ configure fields
→ save preset

Example:

    New preset

    Preset name
    [ Newsletter ]

    Workspace
    [ gerainchick ▼ ]

    Destination
    [ Choose destination › ]

Once destination is selected:

    Available properties

    Name          title
    Type          select
    Pipeline      status
    Tags          multi-select
    URL           url
    Author        rich text
    Published     date

The user chooses which properties appear during clipping.

## Preset storage

Existing preset data should be migrated rather than discarded.

Current data includes:

- id
- name
- workspaceId
- workspaceName
- workspaceUserId
- destinationId
- destinationType
- destinationName
- destination icon
- destination parents
- destinationParentId
- destinationParentTable
- propertyIds

Extend the preset model with a field configuration array.

Proposed shape:

    fields: [
      {
        propertyId: "...",
        propertyName: "Name",
        propertyType: "title",
        label: "Title",
        order: 0,
        visible: true,
        source: "page_title",
        defaultValue: ""
      },
      {
        propertyId: "...",
        propertyName: "Tags",
        propertyType: "multi_select",
        label: "Tags",
        order: 1,
        visible: true,
        source: "manual",
        defaultValue: []
      },
      {
        propertyId: "...",
        propertyName: "URL",
        propertyType: "url",
        label: "URL",
        order: 2,
        visible: false,
        source: "page_url",
        defaultValue: ""
      }
    ]

## Migration for current vid preset

The current preset should automatically become equivalent to:

- Name / title
  - source: page_title
  - visible: true

- Tags / multi_select
  - source: manual
  - visible: true

- URL / url
  - source: page_url
  - visible: false

Current behavior must continue working after migration.

## Capture content

Article / Text / Area are not Notion database properties.

Treat them as ClipNest capture behavior.

For V1 of this project:

- Article
- Text when webpage selection exists
- Area

The preset may later define which modes are available or which one is the default.

## Sticky Save

The clipping screen may scroll if a preset contains many fields.

The Save to Notion action should remain easy to reach.

Preferred behavior:

- main field area scrolls
- Save button stays in a protected bottom area

Avoid nested scrolling except for compact option pickers.

## Settings changes

The current large Notion preset editor in the global Settings page should eventually become secondary.

Global Settings may contain:

- connection/session status
- permissions
- advanced settings
- manage presets entry point

Preset editing should primarily happen from the Notion preset UI.

## Implementation phases

### Phase 1 - Navigation shell

- Add Notion preset chooser view.
- Notion tab opens chooser every time.
- Clicking preset opens clip view.
- Back returns to chooser.
- Gear opens edit preset.
- Preserve existing save behavior.

Acceptance:

- Existing vid preset can still save an article.
- No Notion backend regression.

### Phase 2 - Preset field model

- Add fields array to preset storage.
- Migrate current property mappings.
- Current vid preset migrates automatically.
- Do not break existing users.

Acceptance:

- Existing preset works without manual recreation.
- Stored Notion property IDs remain unchanged.

### Phase 3 - Dynamic renderer

- Render clipping fields from preset.fields.
- Move current Title and Tags into renderer.
- URL can be hidden and populated automatically.
- Generalize multi-select chip component.

Acceptance:

- Two presets can display different fields.

### Phase 4 - Preset editor

- Edit name.
- Choose workspace.
- Choose destination.
- Configure field visibility.
- Configure field order.
- Configure source/default values.

Acceptance:

- User can build a second preset with a different field layout.

### Phase 5 - Dedicated destination screen

- Move destination browser into its own view.
- Reuse existing destination discovery.
- Return selected destination to preset editor.

Acceptance:

- No giant destination result panel remains permanently visible.

### Phase 6 - New preset flow

- Create preset.
- Select workspace.
- Select destination.
- Read schema.
- Choose fields.
- Save.

Acceptance:

- User can create multiple presets targeting different databases/pages.

### Phase 7 - Additional Notion property types

Add in this order:

1. select
2. status
3. rich_text
4. checkbox
5. date
6. number

Then evaluate:

- images/files
- relations
- people

## Explicit non-goals for initial refactor

Do not:

- redesign Obsidian
- remove the existing private Notion session writer
- replace presets with a single remembered destination
- automatically open the last-used preset
- call presets "Forms"
- add all Notion property types before the dynamic renderer exists
- rewrite working article extraction
- rewrite working tag creation

## UX acceptance criteria

The project is complete when:

1. Opening Notion always shows all presets.
2. Selecting a preset opens that preset's clipping configuration.
3. Different presets can display different fields.
4. Back returns to preset chooser.
5. Edit preset can change destination and fields.
6. New preset can be created without using the old Settings workflow.
7. Existing vid preset migrates automatically.
8. Existing tag colors and tag creation still work.
9. Article/Text/Area saves continue to work.
10. Multiple presets can target different workspaces and destinations.
11. Save remains easy to reach even with many fields.
12. Obsidian behavior is unchanged.

## Release

Keep manifest version at 0.8.0 during implementation.

Only bump after:

- migration tested
- multiple presets tested
- Article tested
- selected Text tested
- Area tested
- new preset tested
- existing preset tested
- workspace switching tested
- destination switching tested
