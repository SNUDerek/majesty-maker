VAR scion = "Joan"
VAR player = "Gerald"
VAR bellatores = 15
VAR oratores = 15
VAR laboratores = 15
VAR fatigue = 0
VAR melancholy = 0
# cooldown: 2
-> END

=== sample_meeting ===
# order: 10
# activity: hedge_knight
# bg: school
# left: scion
hedge_knight: A steady hand, {scion}. Your guardian {player} would be proud.
scion: (He makes it sound so easy.)
The courtyard falls silent.
squire: Shall we try a bout? # right: squire
* [Accept the challenge]
    scion: Only if you promise not to sulk.
* [Ask for advice]
    scion: Show me how you hold your guard first.
- hedge_knight: Enough chatter. Begin! # bg: job # right: hedge_knight
-> END
