VAR scion = "Joan"
VAR player = "Gerald"
VAR bellatores = 15
VAR oratores = 15
VAR laboratores = 15
VAR fatigue = 0
VAR melancholy = 0
# cooldown: 2
-> END

=== cloister_1 ===
# title: The Hermit
# order: 10
# activity: hermit
// Draft characters: hermit = Diogenes, novice = Serena, deacon = Deacon Jerome.
Diogenes’ study is a chaotic mountain of crumbling scrolls, dried herbs, and astrological charts.
hermit: The Divine is not found in perfectly straight lines, girls! It is in the roots of the earth and the erratic dance of the stars!
novice: With respect, Master Diogenes, the Mother Church teaches that order is the highest form of piety. This room is practically a heresy.
{ oratores > 20:
    You easily decipher the chaotic notes on Diogenes' desk, recognizing a brilliant, if erratic, mind at work.
- else:
    You stare blankly at a chart of the zodiac, completely overwhelmed by the disorganized mess.
}
scion: (She’s sharp, but she looks at Diogenes like he’s a stain on her shoes. I don't think she likes me much either.)
* [Defend Diogenes]
    scion: Sometimes the truth doesn't fit neatly into a pristine ledger, Serena.
* [Diplomatic]
    scion: Perhaps there is room for both order and a little chaos in our studies?
- novice: I prefer not to gamble my soul on 'a little chaos.' But you are from the country; I suppose you are used to the mud.
-> END

=== cloister_1b ===
# title: The Deacon
# order: 20
# activity: scriptorium
The abbey scriptorium is freezing, silent, and flawlessly organized. Deacon Jerome stands at the front, inspecting the inkwells.
deacon: Every letter you transcribe is a brick in the fortress of faith. A single error is a crack where the darkness enters. Accuracy is holiness.
{ melancholy > 30:
    The sheer weight of the silence and the rigid expectations presses down on you, making it hard to breathe.
- else:
    You find the strict quiet of the stone room surprisingly calming after the chaos of the outside world.
}
scion: (He means well, but he speaks of faith as if it were a prison wall. There is no joy in his voice at all.)
* [Dutiful]
    scion: I will be careful, Deacon Jerome. My hand will not slip.
* [Questioning]
    scion: But surely the Saints understand if a tired scribe makes a small mistake?
- deacon: The Saints demand our absolute best, child. We do not lower the standard to accommodate human weakness. Take your seat.
-> END

=== cloister_2 ===
# title: The Scriptorium Rules
# order: 30
# activity: scriptorium
You finish grinding a fresh batch of expensive lapis lazuli ink, intending to use it for an illuminated manuscript. Serena steps in front of you.
novice: Abbey Rule number fourteen states novices must complete three weeks of plain-text transcription before handling illuminated folios. I will take that ink.
{ laboratores > 35:
    scion: You're just using bureaucratic loopholes to take the most prestigious assignment for yourself, Serena.
- else:
    scion: But I was the one who spent two hours grinding this pigment!
}
deacon: Serena is correct. The rules preserve the hierarchy of learning. Give her the ink, and return to the psalms.
scion: (She isn't breaking the rules; she's weaponizing them to keep herself at the top and me at the bottom.)
* [Resentful]
    scion: Fine. Take it. I hope your illuminations are as rigid as your personality.
* [Graceful]
    scion: Keep it. If your faith requires stepping on others to feel elevated, I pity you.
- novice: I do not need your pity. I only need the Deacon's approval, which I have.
-> END

=== cloister_3 ===
# title: The Heathen Text
# order: 40
# activity: hermit
Diogenes drops a massive, dust-covered tome onto the table. It is written in ancient Greek.
hermit: The Materia Medica of Dioscorides! Pre-dates the Church by centuries. Pay attention to the chapter on the white willow tree!
novice: A pagan text? Absolutely not. I will not read heathen superstitions when Galenic medicine is sanctioned by the abbey.
{ oratores > 40:
    You smoothly translate the Greek, realizing the text isn't superstition at all, but highly detailed botanical science.
- else:
    You struggle with the unfamiliar alphabet, but Diogenes points out detailed, practical sketches of herbs and roots.
}
scion: (She is blinding herself on purpose. She would rather be 'correct' than actually learn something new.)
* [Direct]
    scion: Serena, this describes how to break a fever using tree bark. It isn't magic, it's practical medicine.
* [Let it go]
    scion: Suit yourself. But I'm going to read it. Knowledge is knowledge.
- novice: The abbey provides all the knowledge necessary for salvation and health. I will pray for your misguided soul.
-> END

=== cloister_4 ===
# title: The Climax
# order: 50
# activity: scriptorium
A desperate commoner is brought into the abbey's hospice wing, shivering violently with the ague. Jerome and Serena are at his bedside.
deacon: His humors are terribly imbalanced. Apply the heated cups, Serena, and pray for the Saints to intervene.
novice: I have applied them, Deacon, but the fever only rises! The orthodox texts say he should be recovering by now!
{ oratores > 50:
    You don't hesitate. You rush to the apothecary cabinet, immediately recognizing the dried white willow bark from Dioscorides' text.
- else:
    You scramble to remember Diogenes' lesson, desperately pulling out a bundle of pale bark you hope is the right one.
}
scion: The heated cups are only dehydrating him! He needs a tea steeped from this willow bark. It will break the fever.
novice: That is unsanctioned heathen medicine! Deacon Jerome, forbid her!
scion: (If we wait for a miracle, he dies. We have to act!)
* [Take Charge]
    scion: I don't care if it's unsanctioned! Help me brew this, Serena, or his blood is on your hands!
* [Plead]
    scion: Serena, please. Look at him. If your orthodoxy is truly compassionate, you will let me try this.
- Serena hesitates, looking at the dying man, then at you. Her rigid posture breaks. She grabs a kettle and helps you brew the tea.
-> END

=== cloister_5 ===
# title: The Resolution
# order: 60
# activity: hermit
# reward: item saints_relic
Diogenes’ study. The commoner's fever broke the night before. Serena stands quietly by the window, looking humbled.
novice: Deacon Jerome was furious... but the man lived. I realize now that my rules were a shield against the messy reality of the world.
// Draft condition: Bellatores + Oratores + Laboratores > 80; use this arc's single stat.
{ oratores > 80:
    Serena looks at you with profound respect, seeing the capable, well-rounded leader you are becoming.
- else:
    Serena gives you a small, tentative smile, extending an olive branch of genuine friendship.
}
scion: (She saved his life too. I had the medicine, but she provided the clean bed, the broth, and the care.)
* [Gracious]
    scion: I couldn't have saved him without the abbey's hospice, Serena. We needed each other.
* [Philosophical]
    scion: The truth doesn't just come from one book, Serena. It comes from everywhere.
- hermit: Well said, both of you! You have learned to read the spirit of the law, not just the ink.
hermit: Before you leave for your Pilgrimage, child, take this. A true Saint's Relic. Use it when your own wisdom is not quite enough.
-> END
