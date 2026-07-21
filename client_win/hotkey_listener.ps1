# hotkey_listener.ps1 - Écouteur global de raccourci clavier Ctrl + Alt + K / Ctrl + AltGr + K pour OmniSign

if (-not ([System.Management.Automation.PSTypeName]'OmniSignHotkey').Type) {
    $code = @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;

public class OmniSignHotkey {
    [DllImport("user32.dll")]
    public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll")]
    public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll")]
    public static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [StructLayout(LayoutKind.Sequential)]
    public struct MSG {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public POINT pt;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int x;
        public int y;
    }

    public static void Listen(string batPath) {
        // ID: 1, Modificateurs: MOD_CONTROL (0x0002) | MOD_ALT (0x0001) = 0x0003
        // VK_K = 0x4B (Key K)
        RegisterHotKey(IntPtr.Zero, 1, 0x0003, 0x4B);

        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0)) {
            if (msg.message == 0x0312) { // WM_HOTKEY
                UnregisterHotKey(IntPtr.Zero, 1);
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "cmd.exe";
                psi.Arguments = "/c \"" + batPath + "\"";
                psi.UseShellExecute = true;
                Process.Start(psi);
                break;
            }
        }
    }
}
"@
    Add-Type -TypeDefinition $code
}

$batFile = Join-Path $PSScriptRoot "kill_omnisign.bat"
if (Test-Path $batFile) {
    [OmniSignHotkey]::Listen($batFile)
}
