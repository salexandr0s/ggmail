!macro customUnInstall
  DeleteRegKey HKCU "Software\ggmail"
  DeleteRegKey HKCU "Software\Clients\Mail\ggmail"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\ggmail"
  DeleteRegKey HKCU "Software\Classes\ggmail.mailto"
  DeleteRegKey HKCU "Software\Classes\ggmail.url"
  DeleteRegValue HKCU "Software\RegisteredApplications" "ggmail"
  DeleteRegValue HKCU "Software\RegisteredApplications" "ggmail.url"

  # SHCNE_ASSOCCHANGED, so the shell drops ggmail from its handlers. Without
  # SHCNF_FLUSH: that blocks until every shell window has handled the event,
  # which from an installer's UI thread deadlocked against Explorer.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
