VAR scion = "Joan"
VAR player = "Gerald"
VAR bellatores = 15
VAR oratores = 15
VAR laboratores = 15
VAR fatigue = 0
VAR melancholy = 0
# cooldown: 2
-> END

=== knight_1 ===
# title: The Hedge Knight's Squire
# order: 10
# activity: hedge_knight village_watch
hedge_knight: You hold that sword like a ladle, {scion}.
scion: (He says that every week.)
A lanky boy in a patched tabard leans on the fence, smirking.
squire: Want me to show her how it's done, ser? # right: squire
* [Accept the challenge]
    scion: Show me, then. If you can.
* [Ignore him]
    scion: (Better not to rise to it.)
- hedge_knight: Enough. Both of you, at the pell. Now.
-> END
