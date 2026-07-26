/**
 * Import for side effects: each application registers itself.
 *
 * A registry populated by import rather than by a central list means adding an
 * application touches one file — its own — and forgetting to import it here is
 * the only way to lose one, which the launcher makes immediately obvious.
 */
import "./LauncherApp/LauncherApp";
import "./SourceApp/SourceApp";
import "./PipelineApp/PipelineApp";
import "./EncodingApp/EncodingApp";
import "./ChartApp/ChartApp";
import "./TableApp/TableApp";
import "./ChartsApp/ChartsApp";
import "./GalleryApp/GalleryApp";
import "./CompareApp/CompareApp";
import "./InspectorApp/InspectorApp";
import "./WatchlistApp/WatchlistApp";
import "./TraceApp/TraceApp";
import "./AboutApp/AboutApp";

// The teaching layer as tiles (DATADROP-7). Their content comes from
// TourContent, not from props: a tile names an application and carries nothing
// else, so §A's rail and §C's rail are the same application over different
// context.
import "./LessonsApp/LessonsApp";
import "./CheatApp/CheatApp";
import "./BriefApp/BriefApp";
import "./ModulesApp/ModulesApp";
import "./tutorials/Tut1";
import "./tutorials/Tut2";
import "./tutorials/Tut3";
import "./tutorials/Tut4";

// Accounts (DATADROP-5).
import "./SignInApp/SignInApp";
import "./ProfileApp/ProfileApp";
import "./TokensApp/TokensApp";
import "./UploadApp/UploadApp";
