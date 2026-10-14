/* Builds AR Animal Run for the web, exactly as it is.

   Nothing about the game is changed here. The jump is still the single
   line in Character_Controller that reads KeyCode.Space, which the
   page around the build can satisfy with an ordinary keyboard event —
   so the switch layer (mouth, hand, eyebrows) drives the real game
   without a line of its C# being touched.

   Run headless:
     Unity.exe -quit -batchmode -nographics -projectPath <proj> \
       -buildTarget WebGL -executeMethod WebBuild.Run -logFile - */
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class WebBuild
{
    public static void Run()
    {
        var outDir = ArgOr("-outDir", Path.Combine(Directory.GetCurrentDirectory(), "WebBuild"));

        var scenes = EditorBuildSettings.scenes
            .Where(s => s.enabled)
            .Select(s => s.path)
            .ToArray();

        if (scenes.Length == 0)
        {
            Debug.LogError("[WebBuild] no enabled scenes in Build Settings");
            EditorApplication.Exit(2);
            return;
        }
        Debug.Log("[WebBuild] scenes: " + string.Join(", ", scenes));

        /* Compressed, with Unity's own fallback decompressor bundled in.
           That keeps the download small without the web server having to
           send Content-Encoding headers for .gz files — this build is
           served by the same plain express.static as the rest of the
           site, and asking the client to special-case it would be one
           more thing to get wrong on deploy. */
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
        PlayerSettings.WebGL.decompressionFallback = true;
        PlayerSettings.WebGL.linkerTarget = WebGLLinkerTarget.Wasm;
        PlayerSettings.WebGL.dataCaching = true;
        PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.None;
        PlayerSettings.runInBackground = false;

        // Smaller download; this game uses none of what gets stripped.
        PlayerSettings.SetManagedStrippingLevel(
            NamedBuildTarget.WebGL, ManagedStrippingLevel.High);
        PlayerSettings.stripUnusedMeshComponents = true;

        var opts = new BuildPlayerOptions
        {
            scenes = scenes,
            locationPathName = outDir,
            target = BuildTarget.WebGL,
            targetGroup = BuildTargetGroup.WebGL,
            options = BuildOptions.None,
        };

        Debug.Log("[WebBuild] building to " + outDir);
        var report = BuildPipeline.BuildPlayer(opts);
        var s = report.summary;
        Debug.Log(string.Format(
            "[WebBuild] {0}  {1} bytes  {2} errors  {3}",
            s.result, s.totalSize, s.totalErrors, s.outputPath));

        EditorApplication.Exit(s.result == BuildResult.Succeeded ? 0 : 1);
    }

    static string ArgOr(string name, string fallback)
    {
        var a = Environment.GetCommandLineArgs();
        for (var i = 0; i < a.Length - 1; i += 1) if (a[i] == name) return a[i + 1];
        return fallback;
    }
}
