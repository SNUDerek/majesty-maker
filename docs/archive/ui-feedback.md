
# playtest feedback

## general comments

- NOTE: the parchment image has an illustrated border that is inside the image border, so there needs to me some margins (right now, the left aligned texts go past the drawn edge of the paper, and the top text appears "over" the little curled corner of the parchment image)
- was there a design desision behind rendering the fatigue and melancholy bars differently (using shape components i guess?) from the estates bars (using the graphical ui elements)? is it due to the shading effect? personally i'd rather use the kenny ui bars for those as well. if the colors are an issue, we can just double up now, and i can edit it with different colors later. for the vertically-oriented parts using the parchment background, maybe right-aligning some elments can help. but for meters etc we need to mind the transparent margin.
- i think we should use text formatting where appropriate to highlight stat info. we established bellatores is red, oratores is blue, and laboratores is green, so coloring them that color in certain screens would be helpful. for example in the tutoring screen, for the results on each tutor's card, and in the outcomes.
- to discuss and maybe implement later: set emoji for stats, conditions (fatigue, melancholy) and use them as well for even better readability.
- is the event log being stored anywhere? it'd be nice (for both gameplay and debugging) to have a way to check what i've done in previous weeks. i think a later feature would be a fully fleshed out calendar interface, but even just a text-based log would be good.

## story prologue

okay, intro functionality is good from what i saw, but i had different vision for the layout, i didn't explain that, so let me do so now.

i was thinking about it like the legend of zelda link to the past prologue, a bit:

- black background (right now, title screen is darkened behind it)
- the parchment is large (height is maybe 86% of the screen), and not framed inside a ui element.
- intro pictures appear within this parchment, centered left/right and near top. maybe 50-60% of the size it is now.
- the text appears below this image, also within the parchment borders.
- some effects might be nice, at least some sort of fade in, fade out for the images. ideally the text should appear by cahracter, rpg style, but maybe that's beyond the scope of this.
- the skip and begin buttons are good. not sure we need the 1...10/10 progress thing but let's keep it for now

## creation screen

um, i wanna rework this but it's the least important part in my opinion. so let's leave it for now.

## home screen

- especially since we plan to add more activities (at least social encounters), maybe we can arrange the choices in a single column instead of a 2x2 rectangle?
- on right side panel, instead of italics, let's make "Estates" and "Condition" in Canterbury. also, let's show the daughter's full name (daughter name + house name).

## tutor screen

- the stats buffs, condition accrual, and cost are all formatted as a single sentence, so it's hard to parse. can we break them into different lines (and maybe color the condition gains grey or something so i know they are bad)? also it says "Coin -20" but there's also a graphic of a coin with -20.

## work screen

- let's align the options in one column instead of 2x2, to reduce the dead space at the botton.

## rest screen

- let's align the options in one column instead of 2x2, to reduce the dead space at the botton.

## pilgrimage screen

- the initial screen is chaotic, can we offload some of the tutorializing to a one-time pop-up tutorial (and small ? button to allow playter to revist the tutorial)? we could use the parchment again for this. it could be broken down into multiple screens if needed.
- okay so this is a thematic issue, i like that you brainstormed some situations for the encounter cards, but you matched the encounter to the card color, not to the estate best for handling it. e.g. the "a broken bridge needs mending" is green and a laboratores card, but that means bellatores is actually the best for the job. not sure how to resolve this uh, 'ludonarrative dissonance',


