# Rebuilding AR Animal Run for the web

`/games/animal-run-3d/` is the client's own Unity game — *AR Animal Run*,
the 2020 project — compiled to WebGL. It is his scenes, his animals, his
three modes and his scoring, unchanged. The page around it
(`game46.html` + `assets/unity-switch.js`) only gives it a different way
to be pressed.

The build output is committed because the site is deployed by pulling
this repository, and nothing on the server has Unity on it. It is about
22 MB, so **do not commit a rebuild unless the game has actually
changed** — each one adds its full size to the history for good.

## Why it needs no changes to his C#

The whole of that game's input is one line:

```csharp
// Character_Controller.cs:45
if (Input.GetKeyDown(KeyCode.Space))
```

A Unity WebGL build reads real keyboard events off the page, so the
switch layer turns a mouth, a hand or an eyebrow into a Space keydown
aimed at the canvas. His code never learns the difference. That is
deliberate: a reimplementation drifts from the original every time
either side is touched, and this cannot.

## What was changed, and only this

The source project is kept read-only. A working copy lives outside this
repository, at `../unity-animalrun`, and three things were removed from
it:

1. **AR Foundation, ARCore and ARKit packages.** WebGL does not support
   them, and nothing needs them: none of the four build scenes contains
   a single AR component.
2. **`Assets/Scripts/AR.cs` and `Assets/XR/`.** `AR.cs` is not attached
   to any scene in the build.
3. **Two lines in `GameManager.cs`** that called `GetComponent<AR>()`
   inside `EnadlePlacingObject` / `DisadlePlacingObject`. Both methods
   are kept, because old UI buttons reference them by name; they just no
   longer reach into a component that is gone. Nothing calls either
   method from script.

Nothing else. No gameplay, no art, no balance, no scenes.

## Building

The project was authored in Unity **2020.2.7f1**, which is not installed
here; it was built with **6000.3.8f1**, the only installed editor with
the WebGL module. Unity upgraded the project on open and his scripts
compiled with zero errors.

```
"D:\Unity\6000.3.8f1\Editor\Unity.exe" -quit -batchmode -nographics ^
  -projectPath "..\..\..\unity-animalrun" -buildTarget WebGL ^
  -executeMethod WebBuild.Run -outDir "..\..\..\unity-animalrun\WebBuild" ^
  -logFile -
```

`WebBuild.cs` in this folder is the build script; it belongs in the Unity
project at `Assets/Editor/WebBuild.cs`. It sets gzip compression with
Unity's decompression fallback switched on, so the files can be served by
the same plain `express.static` as the rest of the site — no
`Content-Encoding` headers to get right on deploy.

Copy the result to `games/animal-run-3d/`. The paywall covers it already:
`server.js` gates anything under `/games/`.

## Known, and not yet settled

- **The Unity splash screen.** The build shows "Made with Unity" on
  start, which a Personal licence cannot remove. His mobile build has
  the same. Removing it needs a Unity Pro/Plus seat.
- **His menu is a pointer UI.** Choosing an animal and a mode, and
  pressing Start, is done by tapping. A child who cannot use a pointer
  needs an adult to set the round up; the switch then plays it. Driving
  that menu from the switch would mean changing his C#, which is a
  decision for him, not an assumption for us.
- **22 MB.** Cached after the first load (`dataCaching`), but the first
  load on a slow school connection is a real wait. This is why the
  lighter 2D version (games 43–45) stays in the catalogue beside it.
