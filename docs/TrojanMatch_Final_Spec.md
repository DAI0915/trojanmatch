# TrojanMatch — 最終プロダクト・技術仕様書

**Final Specification v2.0 — 2026年11月14日**  
**AI@USC Hackathon 2026 | Solo Project | Japanese Product Spec / English Implementation Prompt**  
**Tagline:** *Build better teams. Start building sooner.*  
**Design principle:** *AI recommends. Humans decide.*

> **変更履歴（v1.1 → v2.0）**：Matching Spaceの概念と、Hackathon開催回／Courseの学期・課題単位の厳密な分離を導入。Spaceが存在しない場合の**学生自身による作成**、重複確認、参加者がいないときのCold Start、共有リンク、Community-created表示、SpaceとTeamの権限分離を追加。Find/ Grow/Smart、DB、API、認可、テスト、審査デモ、Claude Code実装指示をすべて更新。

---

---

## 0. プロダクト定義と決定事項（必読）

### 0.1 Problem / Solution

**Problem**：ハッカソンや授業のグループ課題で「締切までに自分でチームを組む」という形式のとき、学生は知り合いやチャットに頼り、スキルの重複、熱量の不一致、日程の衝突、招待への返事待ちによって時間を失う。単純なプロフィール推薦では、**既存チームに足りない能力**や**チーム全員の組合せ**までは最適化できない。

**Solution**：TrojanMatchは、特定のハッカソン／課題を表す **Matching Space** に学生が集まり、個人プロフィールとSpaceごとの希望を用いて、チームの検索・募集・AIによる編成提案・招待承認・チーム内コミュニケーションを一貫して支援する。**AI recommends. Humans decide.**

**Tagline**：*Build better teams. Start building sooner.*  
**対象利用者**：USC学生（USCの学生が他大学開催／オンラインのハッカソンを探す場合も対象）。USCの公式アプリではない。  
**主催者・教授の導入**：不要。学生自身がSpaceを作成・参加できる。  
**開発体制**：ソロ、Claude Code中心。コード・UI実装は大会ルールで許された期間に行う。

### 0.2 今回の必須スコープ

1. **Hackathon / Course Project・Homework** の2用途。
2. **Global Student Profile** と **Space-specific Participation Profile**。本人が公開や招待許可を制御する。
3. **Matching Space Discovery / Creation / Join**：既存Space検索、見つからなければ学生が作成、重複検出、参加者ゼロの空状態、招待リンク共有。
4. **Find Your Team**：`Find a Team`（既存の募集チームを探す）と `Grow My Team`（自分の新規／既存チームに人を募集）。
5. **Smart Team Formation**：同じSpaceの許可済み候補から完成形のチーム案を提案、メンバー入替、根拠表示、明示的な招待。
6. **Invitations / Team Management**：参加リクエスト、招待、承認・辞退、人数制限、再推薦、チーム成立管理。
7. **Team Chat + AI Team Kickoff Assistant**：成立したチーム向けチャットと最初の議題・役割・行動案。
8. **Resettable Demo Mode**：全導線を架空プロフィールで実演、別Spaceの候補が混ざらないことも証明。

### 0.3 対象外

趣味・友達・スポーツ観戦の相手探し、全参加者の強制一括割当、大学の正式SSO・Canvas・授業名簿の自動取得、外部ハッカソンの応募認証、決済、音声・動画通話、ファイル共有、大規模SNS機能、公式イベントの代理申込、招待のAI自動送信。いずれも将来の拡張。

### 0.4 絶対に守るプロダクト原則

- **One Space, relevant people**：検索・推薦は必ず現在選択中のMatching Spaceの許可された参加者・チームに限定する。
- **Space ≠ Team**：Spaceは「TreeHacks 2027」など人が集まるイベント／課題の単位。TeamはそのSpaceの中で学生が形成する具体的なグループ。
- **Student-created ≠ Official**：学生作成Spaceを大学／大会主催者が公認したものとして表示しない。Space作成者に全参加者の管理権限を自動付与しない。
- **Human-controlled invitations**：AIの推薦や提案だけでは、招待は送信されず、チームも成立しない。
- **Team-level optimization**：本人に似ている人だけでなく、スキル補完・共同作業時間・目的の整合性を評価する。
- **No fake evidence**：AIの説明・Team Fit・空き枠・参加者数はDBと実計算で裏付ける。実ユーザーとデモの架空人物を区別する。
- **Safe default**：授業Spaceは非公開寄り、プロフィールはオプトイン、チャットは当該チームメンバーのみ。

---

## 0.5. 一覧でわかる仕様上の判断

| 論点 | 決定 | 避ける実装 |
|---|---|---|
| マッチング対象 | 現在選択中の **Matching Space** に参加した学生のみ | 「全ハッカソン参加者」などの横断検索 |
| Space作成者 | 一般学生も作成可能。認証済み主催者とは区別 | 作成者を公式主催者と表示 |
| 既存Spaceがない場合 | 検索→重複候補確認→新規作成→自動参加→共有 | Spaceが存在しないだけで利用不可 |
| 参加者ゼロ／自分だけ | My Space表示、プロフィール登録、募集、共有、人数不足の案内 | 存在しない候補をAIが作り出す |
| 既存チーム選択 | 自分が所属し、募集権限を持つチームから選択 | 他人のチームを勝手に「Grow」する |
| Find a Team | 同じSpaceの募集中・公開チームへ参加申請 | 単なるスキル検索で別Spaceのチーム混入 |
| Grow My Team | 自分の新規／既存チームから学生を募集・招待 | 「他人のチームを検索する」と混同 |
| Smart Team Formation | 完成形の編成案をAIが推薦。ユーザーが招待対象を最終決定 | AIによる無断招待や自動確定 |
| 所属／人数 | チーム定員や同一Space内単一Active所属をサーバーで検証 | 画面のバリデーションのみ |
| 熱量 | 用途別選択式＋任意自由記述。近さを評価 | 「優勝志向の方が高得点」 |
| 権限 | Space作成者は全員のプロフィールやメッセージを閲覧できない | Space creatorを自動で管理者扱い |
| デモ | 明示した架空データ、再現可能な招待／承認／チャット | ダミー表示のみの未実装機能 |

**重要な境界**：学生によるSpace登録は、その人が外部ハッカソンに正式に採択されたことや、授業を履修していることの証明ではない。イベントの参加資格や課題の履修条件は主催者／大学側が決める。

---

## 1. 対象ユーザーと主要シナリオ

| ペルソナ | 状況 | 主要な導線 |
|---|---|---|
| A. 初参加の学生 | TreeHacksに参加したいが知り合いがいない | TreeHacks 2027を検索→なければSpaceを作る→Find a TeamまたはSmart Formation |
| B. すでに2人のチーム | 同じハッカソンでFrontend担当が足りない | Space→Grow My Team→既存チーム選択→Skill Gap→招待 |
| C. 一人の参加者 | コードを書くのは得意だがデザイナーも欲しい | Space→Smart Formation→人数入力→完成形提案→Send Invites |
| D. Course Projectの学生 | 同じ課題を履修する学生と組みたい | University/Term/Course/Section/AssignmentでSpace選択→Find/Smart |
| E. 最初のSpace作成者 | 一覧に課題／イベントがない | Create Space→プロフィール登録→共有リンク→参加者が増えたらマッチング |

### 1.1 ハッカソンの対象範囲

USC主催、他大学主催、オンライン／ハイブリッドを含む。ただし**同じ開催回・年の同じイベント**を1つのSpaceとする。例：`AI@USC Hackathon 2026` と `TreeHacks 2027` は別Space。`TreeHacks 2026` と `TreeHacks 2027` も別Space。対面／オンラインという属性だけで統合しない。

### 1.2 Course Project / Homeworkの対象範囲

少なくとも **大学 + 学期 + 科目コード + 課題名 + 適用Section** を区別する。例：`USC / Fall 2026 / CSCI 567 / Section 1 / Final Group Project`。課題で複数Section横断が明示的に許可される場合だけ共同Spaceを作る。単に同じ科目コードだからといって自動統合しない。

### 1.3 用途別に異なる評価軸

| 条件 | Hackathon | Course Project / Homework |
|---|---|---|
| スキル補完 | 高 | 中〜高 |
| 目標の一致 | 高（勝利・成果・学習） | 高（成績・深い学習・要件達成） |
| 関心テーマ | 高 | 中 |
| 共同作業できる時間 | 高 | 非常に高 |
| 作業スタイル | 中 | 高 |
| チーム人数 | 当該イベントの規定 | 当該課題の規定 |

マッチングのルールとスコアはSpace単位で適用。プロフィールの共通部分だけを複数Spaceで再利用する。

---

## 2. 情報設計・画面一覧・導線

**Primary navigation**：`Discover` / `Smart Match` / `My Teams` / `Invitations` / `Profile`。画面上部に現在選択中の **Matching Space Switcher** を常時表示。`Change Space` から別イベント／課題に切り替え可能。`My Spaces` で参加済みを一覧表示する。

| 画面ID | 画面 | 主な要素 |
|---|---|---|
| S01 | Landing / Auth | 価値提案、Sign in、Demo Mode |
| S02 | Global Profile | 名前、共通スキル、興味、経験、公開範囲 |
| S03 | Use-case Selector | Hackathon / Course Project・Homework |
| S04 | Space Search / My Spaces | 検索、参加済みSpace、絞り込み、Create New Space |
| S05 | Create Matching Space | Hackathon / Courseの専用フォーム、重複警告、公開設定 |
| S06 | Space Detail / Join | 属性、参加人数、チーム人数、Join / Share / Edit Own Participation |
| S07 | Participation Setup | Space固有の目標、空き時間、関心、募集・招待可否 |
| S08 | Discover Hub | Find a Team / Grow My Team / Smart Team Formationの入口 |
| S09 | Find a Team | 募集中チーム一覧、フィルタ、チーム詳細、Request to Join |
| S10 | Grow My Team | 自分のチーム選択・新規作成、募集要件、Skill Gap、推薦候補 |
| S11 | Smart Team Formation | 希望人数、重み、完成形案、Replace、理由、Send Invites |
| S12 | User / Team Detail | 許可済みプロフィール、強み、目標、活動時間、募集条件 |
| S13 | Invitations | Incoming / Outgoing、Accept / Decline / Cancel、状態表示 |
| S14 | My Teams | Draft / Forming / Active / Archived、定員・メンバー |
| S15 | Team Workspace | チャット、メンバー一覧、AI Kickoff |
| S16 | Demo Control | 架空参加者の再生成、複数アカウント／Inbox切替、リセット |

### 2.1 初回ユーザーフロー

`Landing → Sign in / Demo → Global Profile → Hackathon or Course → Search Matching Space → [Found: View & Join / Not found: Create Space] → Participation Setup → Discover Hub → [Find a Team / Grow My Team / Smart Formation] → Invitations → Active Team → Workspace`

### 2.2 既存ユーザーの短縮導線

`My Spaces → Space Switcher → Discover / Smart Match / My Teams`。未参加のSpaceは検索・基本情報の閲覧までは可能だが、他人の非公開プロフィールの閲覧や推薦は不可。

### 2.3 `Find Your Team` と `Smart Team Formation` の明確な違い

- **Find Your Team**：利用者が検索・候補比較・個別のRequest／Inviteを主導。内部に `Find a Team` / `Grow My Team` がある。
- **Smart Team Formation**：AIが**希望人数の完成形チーム案**を一括提案。利用者が確認・編集し、招待を明示的に送信する。
- いずれの機能も、Space未選択では開始できない。Space Switcherの現在値でフィルタを適用する。

---

## 2A. Matching Space：検索・新規作成・参加の完全仕様（新規追加）

### 2A.1 Matching Spaceとは

特定のハッカソン開催回、または特定の授業課題に学生が集まる**マッチング単位**。Spaceには参加者（Participation）と複数チーム（Team）が属する。学生がSpaceを作成してもチームを作成したことにはならない。Space参加後にチーム未所属でも `Looking for Team` をオンにできる。

### 2A.2 Space検索で見つかった場合（Found）

1. `Hackathon` または `Course Project` を選択。
2. 名前／公式URL／科目コードなどで検索。サーバー側で候補を取得。
3. 結果カードに **Space名、開催年／学期、開催方式／対象Section、Community-createdまたはVerified、チーム人数制限、参加者数** を表示（未確認ならUnknown）。
4. 選択するとSpace Detail。イベントの利用条件／募集期限・参加資格はユーザーが確認する。
5. `Join Space` → 必要に応じて参加コード検証 → Space-specific Participationを設定 → 検索・募集を開始。
6. すでに参加済みなら `Go to Space`。同一ユーザーが同一Spaceに二重参加しない。

### 2A.3 Spaceが見つからない場合（Not Found → Create）

1. 検索結果の空状態に `No matching spaces found` と **`Create New Space`** を表示。
2. 作成フォームの直前に正規化した名称／年／URL／学期を再検索し、**似た既存Spaceの候補**を出す。
3. ユーザーが候補を確認し「同一」なら既存Spaceへ参加、「別イベント／課題」なら新規作成へ進む。
4. 用途別フォームへ必要項目を入力。AIが公式URLから取得できる場合も**提案値**として示し、本人が確認／修正。取得不能なら手入力可能。
5. 重複チェック・必須項目チェック・参加資格や閲覧範囲の注意書きを確認して `Create Space`。
6. DB上でSpace作成と作成者のParticipation追加を**同一トランザクション**で行う。作成者はSpace参加者になるが、**Teamは自動作成しない**。
7. `Space Created` → Space Detailへ遷移。`Create a Team` / `Find a Team` / `Smart Formation` / `Copy Invite Link` の選択肢を表示。
8. 後から見つけた学生は、その同じSpaceへ `Join` して候補プールに加わる。

### 2A.4 Hackathon Space作成フォーム

| フィールド | 必須度 | 入力と検証 |
|---|---|---|
| Event name | 必須 | `TreeHacks 2027`。同名別年との識別が必須 |
| Event edition / year | 必須 | `2027`。開催回に紐付け |
| Host / institution | 推奨 | `Stanford University` 等。学生入力は未認証情報 |
| Official URL | 強く推奨 | 有効URL形式、重複判定の主要キー。URLがないときは未確認ラベル |
| Start / end date | 必須 | タイムゾーンも保存、終了≧開始。未確認の場合の暫定扱いは要明示 |
| Format | 必須 | In-person / Online / Hybrid |
| Venue / city / timezone | 対面なら推奨 | オンラインのみの場合は開催URL等を公開しない |
| Allowed team size | ルールが分かる場合 | min / max。未確認は `Unverified`、アプリ既定値は**暫定**と表示 |
| Team formation deadline | 任意 | 未定ならUnknown。明示がない限り推定しない |
| Official rules link | 推奨 | 募集条件に関する確認先 |
| Visibility / join policy | 必須 | Public-discoverable / Unlisted-invite-link。イベント資格を保証しない |

**外部大会の注意**：学生のSpace参加は、TreeHacks等への当選・参加登録の証明ではない。資格・チーム人数・オンライン参加可否の最終判断は主催者ルールが優先。

### 2A.5 Course Space作成フォーム

| フィールド | 必須度 | 入力と検証 |
|---|---|---|
| University | 必須 | 初期値 USC。他大学との同名科目を区別 |
| Term | 必須 | `Fall 2026`、学年と学期を組にする |
| Course code | 必須 | `CSCI 567`。空白・大文字小文字を正規化 |
| Course title | 任意 | `Machine Learning` |
| Section or allowed sections | 必須 | `Section 1` または教授が認める複数Section。未指定で全学生に公開しない |
| Assignment title | 必須 | `Final Group Project`。異なるHomeworkを混同しない |
| Assignment identifier | 推奨 | 例：HW3、Final Project。名称変更を補足 |
| Team size | 必須／確認後 | 課題指示による人数制限。未確認なら設定者が確認必要 |
| Team formation deadline | 任意 | 日時とタイムゾーン。未確認ならUnknown |
| Join policy | 必須 | **Default: Unlisted + Space join code**。授業履修を公認した認証ではない |
| Assignment instructions link | 任意 | Canvas等の非公開URLを公開画面へ自動展開しない |

**例**：`USC / Fall 2026 / CSCI 567 / Section 1 / Final Group Project`。Section横断が許可されたと本人が明示した場合だけ、allowed_sectionsに複数Sectionを設定。

### 2A.6 新規Spaceに自分しかいない場合（Cold Start）

`You're the first one here!`、`1 member (you)`、`No teammates available yet` を表示。

- 作成者はプロフィール／目標・予定・募集状態を登録し `Looking for a Team` をONにできる。
- **`Copy Invite Link`** で当該Spaceの共有URLをコピーできる。リンク先ではSpace情報を確認して本人が `Join Space` を選ぶ。リンクだけで非公開名簿にアクセスさせない。
- **`Create a Team`** で自分だけのDraft/Recruitingチームを作成し、募集要件と空き枠を掲示できる。
- 候補が0人なら `Smart Formation` は「No matches yet」を明示し、架空プロフィールを推薦しない。
- 「新しい参加者が来たら確認する」という再訪導線は提供。外部メール通知・自動監視は今回の必須スコープ外。
- デモデータの注入は通常の本番Spaceには行わない。Demo Mode内の明示した架空Spaceでのみ行う。

### 2A.7 重複・表記揺れと一意性

1. Official URLを正規化（末尾スラッシュ、ホスト大文字小文字、トラッキングパラメータ等）した識別子を比較。
2. Hackathonは `name_normalized + event_year/edition + start_date` を候補キーにする。同じ名前の別年は別Space。
3. Courseは `university + term + course_code + assignment_identifier/name + allowed_section_set` を比較。学期違い・別課題は別Space。
4. 類似名・URLが不一致なら警告し、ユーザーに選択させる。自動で別Spaceを勝手に統合しない。
5. 作成直前にもサーバーで再検証し、並行作成競合を防ぐ一意制約／トランザクションを用いる。
6. 別名で重複登録されたSpaceの統合作業は今回の管理UI対象外。表示を案内する程度に留め、本人の参加や招待を無断移動させない。

### 2A.8 Spaceの公開・参加権限

- `Community-created` は学生による登録を示す。`Verified` は**実際に運営者の検証フローがある場合のみ**。MVPではVerifiedを付けず、全学生作成SpaceはCommunity-created。
- Space作成者には、名称・日付等の限定的な編集（必要なら変更履歴）を許可してもよいが、**参加者一覧・非公開プロフィール・チャットへの特別閲覧権限はない**。
- `Public-discoverable` Spaceは基本メタデータのみログイン前閲覧可。候補プロフィールやメンバー検索は参加者であること＋本人の公開許可が必須。
- `Unlisted` は正しいリンク／Join codeが必要。Courseでは既定をUnlistedにする。Join codeはサーバー検証し、平文公開や安易な推測を避ける。
- USC学生メール等で認証する場合も、それだけでTreeHacksに実際に採択された／CSCI 567を履修している証明にはならない。アプリ内の参加状態と公式資格は区別。
- Space作成者が退会しても、他の参加者がいるSpaceは勝手に削除しない。終了イベントはArchivedとして新規募集を停止できる。

### 2A.9 SpaceとTeamの関係／状態

`MatchingSpace 1 — N Participations`、`MatchingSpace 1 — N Teams`、`Team 1 — N TeamMembers`。Space作成だけでTeamは生じない。参加者はチーム未所属のまま検索できる。参加していないSpaceへ招待・参加申請・チーム作成は不可。

Spaceの状態は `Open / Closed / Archived` を基本とする。空のSpaceもOpenのまま。チーム形成締切が経過したら募集・新規招待を止め、既存チャットへのアクセスは既存Activeメンバーに残す（アーカイブポリシーに従う）。

---

## 3. プロフィールとSpace別の希望条件（S02・S07）

### 3.1 Global Student Profile — 1人1件

| フィールド | 入力 | 必須 | ルール |
|---|---|---|---|
| Display name | テキスト | はい | 表示名。招待相手にのみ表示する範囲を制御 |
| University / email | 認証アカウント | 本番はい | USC学生向けを基本。正式な大学SSOと混同しない |
| Bio / What I bring | 任意自由記述 | いいえ | AIは構造化候補を提案、本人がApprove/Edit |
| Skills | 複数選択＋自由追加 | はい | Python、React、ML、UI/UX、Pitch等 |
| Preferred roles | 複数選択 | はい | Backend、Frontend、AI、Design、PM/Pitch、Flexible |
| Interests | タグ＋任意記述 | はい | AI、Education、Climate、Health等 |
| Experience | Beginner/Intermediate/Advanced | はい | 自己申告。能力・優劣の保証ではない |
| Working style | 選択式 | 任意 | Async/Sync、Plan-first/Iterate-fast、連絡頻度など |
| Default availability | 週間時間帯グリッド | はい | Space別上書き可能。時間帯・タイムゾーンを保持 |
| Profile privacy | セットアップ時に明示 | はい | 非参加Spaceには非公開、必要項目のみ共有 |

### 3.2 Space-specific Participation Profile — Spaceごとに1件

| フィールド | Hackathonの例 | Courseの例 |
|---|---|---|
| Goal / commitment | Competitive / Build something great / Learn & have fun | Aim for an A / Learn deeply / Meet requirements |
| Topics of interest | AI agent, ClimateTech | Paper topic, research question |
| Desired role | Backend / ML / Design 等 | Implement / Analyze / Present 等 |
| Availability override | 週末・ハッカソン開催時間 | 授業後の曜日・夜間 |
| Team status | Looking / Recruiting / In team / Paused | 同左 |
| Accept invitations | ON/OFF | ON/OFF |
| Smart Formation opt-in | ON/OFF | ON/OFF |
| Additional notes | 任意 | 任意 |

**熱量は選択式＋任意の自由記述**。ランキングの上下を意味せず、希望の類似性と許容度を評価。Grow My Teamの募集要件では `Must-have / Preferred` を指定できる。

### 3.3 同意と公開範囲

同じMatching Space内でも `Visible to space members`、`Accept invites`、`Include me in AI formation` は個別の意思を尊重する。原則、保存前に本人がAI抽出を確認。別Spaceに参加しただけで、自動的にすべての募集・推薦プールへ公開しない。公開されるのはマッチングに必要な承認済み項目のみ。

---

## 4. Find Your Team（S08–S10）

### 4.1 Find a Team — 学生が加入先を探す

**入口**：現在のMatching Spaceを選択してParticipationを作成した学生。検索対象は**そのSpace内の公開・募集中・定員未達チームのみ**。

1. `Recommended for You` に、当該Spaceの募集チームを本人の希望とのFit順で表示。
2. フィルタは役割、必要スキル、テーマ、目標、募集人数、活動時間、募集締切。`Hackathon / Course` の横断フィルタは不要（Space切替で区別）。
3. チームカードはチーム名、人数／上限、募集中の役割、目標、公開許可されたメンバー情報、推薦理由、所属Spaceを表示。
4. 詳細で募集条件と活動時間を確認。`Request to Join` → メッセージ任意 →明示的に送信→ `Pending`。
5. チームの募集権限を持つメンバーが `Accept / Decline`。承認時に人数・所属・締切を再検証する。
6. 満員、募集停止、別Space、未参加、期限切れ、重複申請では送信不可。理由をUIに示す。

**区別**：`Find a Team` は**他人が募集しているチームに参加する**導線。`Grow My Team` で他人のチームを検索して選択するわけではない。

### 4.2 Grow My Team — 自分が募集側になる

1. 現在のSpaceで `Create a New Team` **または** `Choose My Existing Team`。
2. **Existing** には、現在の本人が所属し募集権限のあるチームだけを表示。別Spaceのチーム、他人のチーム、Archivedチームは選択できない。
3. NewではTeam名と目的を入力。作成時点の本人はチームのOwner（まだ一人の場合はDraft/Recruiting）。Spaceは固定で、別イベントのチームにはしない。
4. Existingでは既存の確定済みメンバーを固定し、残り枠と募集条件を編集。
5. 設定する項目：定員／募集中の枠数、必要役割（Must-have／Preferred）、スキル、目標、熱量、興味、活動時間、紹介文。定員はSpace規則に従う。
6. AIが現在のメンバーから **Skill Gap** を算出し、同じSpaceのOpt-in候補に絞って `Recommended Members` を表示。候補の追加によるスキルカバレッジと時間適合性の変化を示す。
7. Owner／募集権限者が **Invite to Team** を明示操作。候補が承認してはじめてメンバー追加。
8. 空き枠がなくなったら募集停止。既存Activeチームへの増員では既存メンバーの再承認を要求しない。

### 4.3 自分一人しかいないSpaceでの挙動

`Create a Team` → 募集内容を公開 → `No candidates yet` ＋ `Share Space`。他の学生がJoinして可視化・招待にOpt-inするまで候補ゼロ。AIは架空の候補を作成しない。

---

## 5. Smart Team Formation（S11）

### 5.1 何を自動化するか

AIは**同じMatching Spaceの同意済み候補のみ**から、ユーザーを含む完成形のチーム編成案を提案する。ユーザーは候補を個別に確認し、Replace / Regenerateを行える。**AIは招待を自動送信しない。チームを無断で確定しない。**

既存チームから開始した場合は、すでに所属するメンバーを固定し、残り枠だけを最適化する（Dynamic Team Completion）。

### 5.2 入力

- Matching Space（必須：現在選択中のもの）と参加状態。
- Desired team size（Spaceのチーム人数ルールの範囲内）。
- ユーザー自身／既存メンバーを固定する条件。
- 目標、関心テーマ、必要スキル・役割、Minimum shared time。
- 優先度プリセット：Balanced Skills / Shared Interests / Schedule / Similar Goals。
- 任意のHard RequirementsとExclude条件。必須条件が過度なら結果ゼロを返す。

### 5.3 推薦結果

- 1つのメイン編成案と、作れれば2つの構成が異なる代替案。
- メンバーカード（同意済み情報のみ）、役割カバレッジ、目標、関心、共通の活動可能時間。
- `Why this team?`：データ根拠に紐づいた説明。`Skill Gaps`：埋まらない不足を正直に表示。
- `Replace member` → 同じSpace内の別候補を評価、**チーム全体のスコアを再計算**。
- `Send Invites (N)` は明示選択した候補だけに送信。招待直前に同意・空き枠・参加状態を再検証。

### 5.4 状態遷移

1. `Proposed` — 画面上の提案のみ。招待・Teamメンバー追加はまだ行われない。
2. `Send Invites` — Userが実行し、対象SpaceにDraft/FormingチームとPending招待を作成。
3. `Forming` — 本人と承認済み候補は確定候補として保持。未回答は保留、辞退は欠員。
4. `All required members accepted` かつ `min_team_size` を満たす → `Active` に昇格。既存チームを増員している場合はActiveを維持する。
5. Decline / Expire → 承認済みを保持して代替候補を再推薦。**代替招待も手動のみ**。
6. 途中で相手が別チームに入ったら、Accept時点で失効・矛盾を検出して再推薦。

### 5.5 他Spaceへの誤招待防止

検索・候補作成・Replace・Send Invitesの**各API段階**で `space_id` による認可と同一Spaceの条件をサーバー側で検証。画面上の選択だけで分離したと見なさない。

---

## 6. AI Matching Engine — アルゴリズムと説明可能性

### 6.1 処理パイプライン

`User-approved profile → Space-scoped candidate retrieval → Hard constraint filtering → Pair/team feature computation → Team optimization → Grounded explanation → Human review → Invite`。

1. **LLM Structured Extraction**：Bioからスキル・興味・役割候補をJSONで提案。本人のApprove/Editが必要。
2. **Semantic similarity**：タグとEmbeddingで関心テーマ・内容の近さを評価。Embeddingが利用不可なら明示タグへフォールバック。
3. **Deterministic Hard Constraints**：所属Space、参加状態、公開同意、人数、期限、役割・時間の絶対条件をサーバーで保証。
4. **Team-level optimizer**：個人への近さではなく、全チームの必要役割カバレッジ、希望・時間・作業スタイルを計算して候補セットを探索。
5. **Grounded Explanation**：実際の入力とスコアの内訳のみをLLMへ渡し、架空の能力・経歴を主張しない。説明が失敗した場合はテンプレート文を生成。

### 6.2 Hard Constraints

- 同一の `space_id` に参加している。
- `looking_for_team`、`accept_invites`、`smart_match_opt_in` 等、当該機能に必要な意思表示がある。
- 公開範囲を超えたプロフィール・別授業の名簿にアクセスしない。
- 定員、Spaceのmin/max、募集中の枠数、締切、アーカイブ状態を尊重。
- 同一Spaceの既存Activeチームとの単一所属ポリシーを確認。
- 必須スキル・役割／活動時間などユーザーがHard requirementにした条件を満たす。
- ユーザー本人を重複して提案せず、既存チームの確定メンバーは固定する。

### 6.3 Soft Team Fit — MVP用初期仮説

`Score(T) = 0.30 SkillComplementarity + 0.25 GoalAlignment + 0.20 InterestAlignment + 0.15 ScheduleOverlap + 0.10 WorkingStyle`

各項目を `[0,1]` に正規化。**この係数は未検証の初期値**であり、実際の推薦品質や合意率を証明する数字ではない。Classでは日程・作業スタイルの重みを増やすプリセットを採用。ユーザーが重視軸を変更したら再最適化する。

- **SkillComplementarity**：必要役割・スキルのカバレッジの増分。重複技能が悪いとは限らないが、不足役割の補完を優先。
- **GoalAlignment**：競争・学習・成果の目標がどの程度一致するか。「勝ちたい」の方が無条件で高得点ではない。
- **InterestAlignment**：共通テーマの意味的近さ。タグとEmbeddingを組み合わせる。
- **ScheduleOverlap**：全員の共通空き時間の量。タイムゾーンを正規化する。
- **WorkingStyle**：同期／非同期、連絡頻度、計画志向などの合致度。

**スコア表示**：`Team Fit: Strong`／各要素の根拠を示す。`96% compatible`のような精度・成功率の誤認を招く表示は避ける。数値を出すなら「内部相対スコア・実計算値」と明示。

### 6.4 最適化アルゴリズム

- 候補数が小さい場合は可能な組合せの列挙＋制約確認。
- 多い場合はBeam Search／Local Search、必要ならOR-Tools。再現可能なrandom seedを使用。
- Grow My Teamでは既存メンバーを固定し、候補ごとの**Marginal Gain**（追加によるスコア上昇）を比較。
- 同じ順番違いを代替チームとして表示しない。候補なしなら明確な理由と条件緩和案を返す。
- PIIを必要以上にLLMへ渡さない。API失敗時でもタグ・ルールベースの検索・推薦を使えるようにする。

### 6.5 技術デモのベースライン

`Baseline`：本人との個人相性ランキングから上位候補を選択。  
`TrojanMatch`：同じ候補集合でSpace制約とチーム全体の役割カバレッジを使って最適化。

比較するのは、算出した役割カバレッジ、共通空き時間、目標一致、Hard constraint violations。都合のよい固定値を表示しない。別Spaceの候補を混ぜたテストでは、TrojanMatchが正しく除外することも示す。

---

## 7. Invitations & Team Management（S13–S14）

### 7.1 Invitation state machine

| 状態 | 意味 |
|---|---|
| Pending | Invite／Requestを送信し相手の応答待ち |
| Accepted | 相手が承認、条件再検証後に所属確定 |
| Declined | 相手が辞退。承認済みメンバーを維持して再推薦可能 |
| Cancelled | 送信者が取り消し |
| Expired | 招待有効期限を経過 |

### 7.2 Team state machine

| 状態 | 意味／チャット利用 |
|---|---|
| Draft | 作成直後。オーナーだけの場合も含む。チャットなし |
| Recruiting | 参加者を募集中。すでにActiveチームのrecruiting flagとしても表現可 |
| Forming | 初期チームの招待・承認が未完了。チャットなし |
| Active | 合意済み初期チームがSpaceの最少人数を満たし成立。チャット可。空き枠があれば募集継続可 |
| Archived | 募集終了・活動終了。履歴の扱いはSpaceポリシーに従う |

**Active判定**：単に「定員が埋まった」ではなく、必要な招待の承認が揃い、合意済みの初期チームが最少人数を満たした時。Activeで追加募集する場合は既存メンバーのチャットを止めない。

### 7.3 招待・参加の規則

- `Request to Join` は学生からチーム、`Invite to Team` は募集権限者から学生。`Send Invites` はユーザーが選んだ候補へ一括送信。
- 招待者・受信者とも当該Spaceに参加済み。SpaceがClosed／Archivedなら新規送信不可。
- Pending招待は複数持てても、同一SpaceでActiveメンバーになれるチームは原則1つ。別チームのAcceptが先に成立した場合は競合を通知。
- 承認時はDBトランザクションでSpace、募集期限、定員、単一所属、対象招待の状態を再検証。
- 重複招待・自己招待・スパムを抑制する。CancelやExpireの説明を表示する。
- チームの募集権限はTeam Owner／権限が委任されたメンバー。**Space Creatorは別チームの招待を操作できない**。
- 退会による再募集はできる。メンバー強制除外や権限移譲はMVP後回しでよいが、情報漏えいを防ぐ。

### 7.4 辞退・参加取り消し後のDynamic Team Completion

辞退または期限切れ→未充足の役割／定員を再計算→既存の承認メンバーと元の条件を固定→代替候補を提示→**人が再招待**。通知だけで勝手に新しい候補へ送らない。

---

## 8. Team Workspace / Chat / AI Kickoff（S15）

### 8.1 Chat MVP

- Activeになったチームにのみチャットを有効化。RLSとサーバー認可で**所属する確定メンバー**だけが履歴閲覧・送信可能。
- テキストメッセージ、送信者、時刻、永続保存、リアルタイム受信。エラー表示・再送・スクロール・Empty stateを用意。
- Chatは**Spaceに所属しているだけでは閲覧できない**。他チーム、Pending招待者、Space作成者に特権はない。
- 今回は既読・リアクション・添付・音声／ビデオ・DM・スレッド・外部連携を作らない。

### 8.2 AI Team Kickoff Assistant

チームがActiveになったあと明示ボタンで初期案を生成（最初の1回を自動表示しても、チームへの投稿・通知はユーザー操作後）。入力は合意済みプロフィールとSpaceの目的・活動時間のみ。

**出力**：①共通目標の要約、②チームの強み・不足、③暫定役割分担、④初回ミーティング議題、⑤最初の3アクション。役割は「suggested」であり、本人の合意なく確定させない。通常のチャット履歴をLLMに自動送信しない。

### 8.3 Workspace構成

左：Team members / Skills。中央：Chat。右またはタブ：AI Kickoffと次のアクション。スマホではタブ切替。現在のMatching Space名を常時確認できる。

---

## 9. UI/UX・ビジュアル仕様

### 9.1 方向性

- Premium SaaS UI。白／ごく淡いグレーを基調に、USCを連想させるCardinal `#990000` と Gold `#FFCC00` をアクセントに限定する。USCの公式認可ロゴを使用しない。
- Desktopは左サイドバー、ヘッダーに**Space Switcher**。Mobileは適切に折りたたむ。すべての主要画面は375pxと1440px幅で検証する。
- 最初の30秒で「Spaceを選び、その中でチームを探す」という操作が理解できる構成にする。
- チーム推薦画面では、人物カードと **Skill Coverage / Schedule Overlap / Goals** を連動表示。Replace時にチャートも実際に変わる。
- Loading、Empty、No-match、Pending、Accepted、Archived、Errorを統一。色だけで状態を表さない。キーボード操作・フォーカスリングも確保。

### 9.2 重要画面のコピー

| 画面 | 見出し／CTA | 重要な補助表示 |
|---|---|---|
| Landing | `Stop searching. Start building.` | `Find Your Team` / `Let AI Build My Team` |
| Space Search | `Find your hackathon or course project` | `Can't find it? Create New Space` |
| Space Detail | `Join this Matching Space` | `Community-created` / Verifiedは実証済みのみ |
| Empty Space | `You're the first one here!` | `Invite others to join` / `Create a Team` |
| Discover Hub | `Find a Team` / `Grow My Team` / `Smart Team Formation` | 現在のSpace名、参加人数、募集チーム数 |
| Grow | `Create a New Team` / `Choose My Existing Team` | 選択可能なのは自分のチームだけ |
| Smart | `Build my ideal team` | `Why this team?` / `Replace` / `Send Invites` |
| Invitations | `Invites Sent — Awaiting Responses` | 承認前にチーム成立と言わない |
| Workspace | `Your Team` | AI Kickoff / Team Chat |

### 9.3 主要画面の優先順位

初見の審査員が触る導線は、`Space Search → Create / Join → Smart Formation → Team Fit → Send Invites → Accept → Workspace` を主軸とする。Find a TeamとGrow My Teamは同一のデザイン言語を持ち、個別に操作できる。チャットの豪華な装飾より、検索／推薦結果と状態のわかりやすさを優先。

### 9.4 可視化の根拠

プロフィールのスキル等は本人が承認した項目から描く。Spaceの参加者数・募集枠・チーム人数はDBから取得。Team Fitチャートは計算結果。固定の`96%`等は使わない。

---

## 10. データモデル／アクセス制御／API

### 10.1 主なテーブル

| Table | 主要カラム | 制約・用途 |
|---|---|---|
| `users` | id, email, university, display_name | 認証User。UUID |
| `profiles` | user_id, bio, skills_json, roles_json, interests_json, experience, availability_json | 共通プロフィール。本人編集 |
| `matching_spaces` | id, type, title, slug, created_by, status, visibility, join_policy, join_code_hash, created_at | SpaceとTeamを分離。creatorは公式の主催者ではない |
| `space_hackathon_details` | space_id, edition_year, organizer, official_url, official_url_normalized, starts_at, ends_at, timezone, format, location, rules_url | Hackathon専用メタデータ |
| `space_course_details` | space_id, university, term, course_code, allowed_sections_json, assignment_name, assignment_key, instructions_url | Course専用メタデータ |
| `space_rules` | space_id, min_team_size, max_team_size, team_deadline_at, verification_status, notes | 確認できた規則／未確認値を区別 |
| `participations` | id, space_id, user_id, goal, interests_json, availability_override, looking_for_team, accept_invites, smart_match_opt_in, visibility | Unique(space_id,user_id) |
| `teams` | id, space_id, owner_id, name, description, status, recruiting, target_size, preferences_json | Teamは必ずSpaceに属する |
| `team_members` | id, team_id, user_id, membership_status, joined_at | Pending invite とAccepted membershipを区別 |
| `invitations` | id, space_id, team_id, sender_id, receiver_id, kind, status, expires_at, created_at | Invite／Request、space_id整合性 |
| `match_runs` | id, space_id, initiator_id, input_json, scoring_json, candidate_ids_json, explanation_json | スコア再現／監査（最小限） |
| `messages` | id, team_id, author_id, content, created_at | チームの確定メンバーのみ |
| `kickoff_briefs` | team_id, brief_json, created_at | 合意済みデータに基づく提案 |

**DBルール**：全ユーザーデータにRLS、参加者とSpaceの複合ユニーク制約、Space/Team一貫性、各Membershipのトランザクション制御。`space_rules.verification_status` が未確認なら、イベント公式規則であると断言しない。

### 10.2 推奨インデックス・重複防止

- `participations(space_id, user_id) UNIQUE`。
- `teams(space_id, status, recruiting)`、`invitations(space_id, receiver_id, status)`に索引。
- `matching_spaces(type, status)` とNormalized nameの検索索引。
- Hackathon `official_url_normalized + edition_year` の実質重複候補検索。確認済み識別子には一意制約を適用。URLが欠ける場合は年＋名称＋日付で候補を警告。
- Course `university + term + course_code + normalized_assignment_key + allowed_sections_key` を候補キーとし、可能なら一意化。
- 単一Space・1 Activeチームの制約は承認トランザクションとサーバー側整合性チェックで保証。

### 10.3 APIエンドポイント例

| Method / Route | 主な役割 |
|---|---|
| `GET/PUT /api/profile` | 共通プロフィール取得・編集 |
| `POST /api/profile/parse` | LLM構造化候補（保存前確認） |
| `GET /api/spaces?type=&q=` | Space検索、本人の閲覧権限で結果を絞る |
| `GET /api/spaces/mine` | 参加済みSpaceの一覧 |
| `POST /api/spaces/check-duplicates` | フォーム入力に類似する既存Spaceの照合 |
| `POST /api/spaces` | 権限付きSpace作成、作成者のParticipation追加 |
| `GET /api/spaces/:id` | Space情報とアクセス可能な統計・メタデータ |
| `POST /api/spaces/:id/join` | Join policy / Codeを検証して参加 |
| `GET/PUT /api/spaces/:id/participation` | Space固有の希望・公開設定 |
| `GET/POST /api/spaces/:id/teams` | 同じSpaceのチームを検索／作成 |
| `POST /api/spaces/:id/match/recommend-members` | 既存チームの不足人材分析と推薦 |
| `POST /api/spaces/:id/match/form-team` | Smart Team Formationの案を返す |
| `POST /api/invitations` | 招待／参加リクエストを明示送信 |
| `POST /api/invitations/:id/respond` | Accept／Decline、競合を検証 |
| `GET/POST /api/teams/:id/messages` | 認可済みチャット |
| `POST /api/teams/:id/kickoff` | AI Kickoffの生成 |
| `POST /api/demo/reset` | デモ環境のみで架空データを再構成 |

### 10.4 認可の重要な例

- `/spaces/:id/match` は Space参加 + Opt-in + 対象候補の許可を検証。
- `/teams/:id/messages` は**実際のActiveチームの確定メンバー**を検証。Space creatorでも他チームのメッセージは見えない。
- `POST /spaces` と `POST /spaces/:id/join` はサーバーで重複・参加コード・状態を検証。
- クライアント指定の`userId`を認証情報として信用せず、サーバーセッションから取得。
- 共有リンクは**ナビゲーション**であり認証・招待承認を代替しない。

---

## 11. 推奨技術構成とモデル運用

| レイヤー | 推奨 | 理由 |
|---|---|---|
| Frontend / server | Next.js + TypeScript + Tailwind CSS | 画面・API・SSRを単一コードベースで管理 |
| UI system | shadcn/ui + Lucide | 統一された操作性、アクセシビリティ |
| DB / Auth / Chat | Supabase PostgreSQL + Auth + Realtime + RLS | Space・Team・招待・履歴の状態管理 |
| LLM | 利用可能なClaude / OpenAI / Gemini API | プロフィール構造化、説明、Kickoff。サーバー経由 |
| Semantics | Embedding API（またはタグ類似度） | 興味・関心の意味的近さ。使えないときにフォールバック |
| Optimizer | TypeScriptのBeam Search / exhaustive search | 再現性、ルールと一体化。必要ならOR-Toolsを検討 |
| Hosting | Vercel + Supabase | 公開URLとDBを迅速に統合 |
| Test | Vitest + Playwright | 同一Space制約、招待競合、E2Eを検証 |

### 11.1 実装の原則

最初はNext.jsのRoute Handlers/Server Actionsで完結。最適化処理が大幅に複雑化した場合のみFastAPIを追加する。LLM APIキーはサーバーにのみ配置。DBへの書き込みも認可と入力検証（Zod等）の後に行う。

### 11.2 Claude Code・Codexの使い分け

- **高推論能力モデル＋High effort**：スキーマ設計、Space一意性・認可、Match engine、招待の競合、難しいデバッグ。
- **高速モデル**：画面・CRUD・軽いUI調整・テスト生成。モデルの具体名／利用制限はClaude Codeの`/model`で確認する。
- **Codex（任意）**：別ブランチ・worktreeでセキュリティ／コードレビュー、E2Eテストの確認。両者が同じファイルを同時編集しない。
- **開始前**：ログイン更新と利用枠の確認。会場のスポンサークレジットが提供されても、それを前提にコアロジックを設計しない。

---

## 12. 非機能要件・安全性・信頼性

- **Security**：認証、RLS、セッション由来のUser ID、Rate limit、入力検証、トランザクション、XSS対策。全書込みでSpaceスコープを検証。
- **Privacy**：Global ProfileとSpace参加を分離。異なるHackathon／Course間で意図しない検索・通知を行わない。Course SpaceはUnlisted + join codeが初期値。
- **Eligibility**：`Join Space` は公式大会参加登録や科目履修の証明ではない。Community-createdとVerifiedを区別。MVPで公式検証手段がなければVerifiedを使わない。
- **Consent**：プロフィール公開、招待受付、Smart Formationの候補化は本人の操作で有効化。AIが招待／役割確定／チャット投稿を代行しない。
- **Fairness**：性別・人種・宗教・国籍などの保護属性をマッチングに使用しない。スキル・希望・時間などの必要な要素だけ使う。
- **Reliability**：LLMが落ちてもSpace検索・プロフィール表示・招待・チャットが壊れない。No match時は条件緩和や共有を案内。
- **Accessibility**：キーボード、フォーカス、ラベル、コントラスト、レスポンシブに対応。
- **Demo integrity**：Demo Modeは明示した架空人物だけ。一般ユーザーにサンプル人物を本物として推薦しない。API／DBの機密キーをGitに含めない。
- **Permissions**：Space作成者＝Team Ownerではない。Space作成だけで非公開名簿・他チームChatの閲覧権限を与えない。
- **Performance**：数十人規模では素早く結果を返せる目標とし、AI／最適化待機の進行表示を用意。保証値を捏造しない。

---

## 13. Acceptance Criteria（合格条件）

### AC01 — Global Profile & Participation
- [ ] 共通プロフィールを保存・編集でき、再ログイン後も残る。
- [ ] 同じユーザーがSpaceごとに熱量・希望役割・予定・招待受付可否を設定できる。
- [ ] LLMが抽出したスキルを、本人が修正・承認してから保存できる。

### AC02 — Matching Space Search / Join
- [ ] Hackathon / Courseを選んで検索でき、開催年／学期・課題違いを区別できる。
- [ ] 見つかったSpaceの詳細からJoinでき、同じSpaceへの二重Joinがない。
- [ ] 未参加Spaceの非公開メンバー・チーム情報を参照できない。

### AC03 — New Space Creation & Cold Start
- [ ] 検索結果ゼロから`Create New Space`へ遷移する。
- [ ] Hackathon／Courseの専用フォームで必須項目を入力できる。
- [ ] 作成前の重複確認が動き、TreeHacks 2026と2027は別、同年の表記揺れは候補提示できる。
- [ ] Space作成で本人だけParticipationが追加され、**Teamは作られない**。
- [ ] 自分しかいないSpaceでプロフィールを登録し、Share Link／Create Teamを使える。
- [ ] 候補0人のSmart Formationは`No matches yet`を表示し、存在しない人物を推薦しない。
- [ ] Space Creatorが別チームのChat・非公開プロフィールを閲覧できない。

### AC04 — Find a Team
- [ ] 同一Spaceの公開・募集中チームだけが表示される。
- [ ] Team detail → `Request to Join` → Pending → Owner側Accept/Declineが動く。
- [ ] 募集停止・定員超過・異なるSpace・締切後の申請は拒否される。

### AC05 — Grow My Team
- [ ] `New Team` を作成でき、`Existing Team` には自分が募集権限を持つものだけが表示される。
- [ ] 募集要件を選択式（＋自由記述）で保存できる。
- [ ] Skill Gapから同一Spaceの候補を推薦し、Inviteの明示操作を要する。

### AC06 — Smart Team Formation
- [ ] 同じSpaceのOpt-in参加者で希望人数の**完成形チーム案**を生成できる。
- [ ] Replaceすると役割カバレッジ・Fit・推薦説明が実際に更新される。
- [ ] 同一Spaceに候補がいない場合はNo match。別Spaceから補充しない。
- [ ] `Send Invites`の押下前はInviteが存在しない。
- [ ] Decline時は承認済みメンバーを保持し代替候補を返す。

### AC07 — Invitation / Team State
- [ ] Pending / Accepted / Declined / Cancelled / Expiredが一貫して反映される。
- [ ] 全必要メンバー承認前にActiveと表示されない。
- [ ] Accept時の競合、人数超過、同一Spaceの多重Active所属を防ぐ。

### AC08 — Team Workspace
- [ ] Activeチームの確定メンバーだけChat閲覧・送信ができ、履歴保存・Realtimeが動く。
- [ ] AI Kickoffが承認済みプロフィールだけで議題・役割案・初回タスクを出す。
- [ ] 招待待ちユーザー／他チーム／Space作成者にChatが漏れない。

### AC09 — Demo & Deployment
- [ ] Demo Modeで `Spaceがない→Create→Join→Match→Invite→Accept→Chat` の一連の体験が再現できる。
- [ ] 少なくとも2つのHackathon Spaceと1つのCourse Spaceがあり、候補が混ざらないことを示せる。
- [ ] Playwright／実ブラウザで核心フローを確認し、公開URL・提出物が完成している。

---

## 14. テストケース・エッジケース

| ケース | 期待結果 |
|---|---|
| TreeHacks 2027が検索で0件 | `No matching spaces` → Create New Space導線 |
| TreeHacks 2027を2人が同時に作成 | 重複／一意制約と再検索、少なくとも無断で2個作られない設計 |
| TreeHacks 2026が既存、2027を作成 | 異なる年度として別Space作成可 |
| 同じHackathonのURL表記違い | 正規化URL等で重複候補として表示 |
| Courseコード同一、Termが違う | 異なるSpace |
| Course同一、Assignmentが違う | 異なるSpace |
| CourseはUnlisted + Join Code | 正しいコードなしでは参加・名簿閲覧不可 |
| 一人だけのSpace | No match、共有・募集導線。架空候補は出さない |
| Space作成後にTeamを作らない | My Spacesには表示、My Teamsには表示なし |
| ある人が別Spaceにのみ参加 | Match APIに候補として出ない |
| 同じSpaceにいるがOpt-out | Smart Formation候補から除外 |
| Owner以外がGrow既存Teamを選ぶ | 操作拒否 |
| 定員上限、未達最低人数 | 招待拒否／Active移行保留 |
| 同時に2チームの招待を承認 | 片方のみ成功、他方は適切な競合応答 |
| 招待Decline／Expire | Pending更新、承認済み維持、再推薦のみ |
| 別チームのChat URLを直打ち | 403等で拒否、内容を返さない |
| Space作成者が他TeamのChatへ接続 | 403等で拒否 |
| LLMの誤ったSkill抽出 | 本人が編集・承認後に初めて確定 |
| LLM／Embedding API停止 | ルール＋タグベースにフォールバック、検索とChatは稼働 |
| 375px／1440px表示 | 横スクロール／レイアウト崩れなし |
| Fake demo userと実ユーザーが混在 | 本番検索ではDemoを含めない。Demo環境に明示表示 |

---

## 15. Claude Code / Codex 開発計画

**開発開始の条件**：大会の正式なルールで許された開始時刻以降にコード、デザイン資産、デモデータを作成する。事前には本仕様・デモ台本・技術選択・競合調査の計画だけ。Claude Code・Codex利用規定は主催者Rulesで確認する。

| Phase | 作業 | 次へ進むゲート |
|---|---|---|
| P0 — Kickoff | 規則確認、Git、環境変数、Auth/DB方針 | 禁止された事前制作がない |
| P1 — Foundation | Next.js、Design System、Auth、Demo scaffold | URLが開き、基本ナビゲーション動作 |
| P2 — Spaces | Space検索／Create／重複防止／Join／Cold Start | **Space 0件から作成→自動参加→共有**が通る |
| P3 — Profiles | Global + Space participation、可視性、Team CRUD | 2つのSpaceで異なる希望が保持される |
| P4 — Matching Core | JSON抽出、Hard constraints、Skill Gap、Team optimizer、Replace | 別Space候補を除外、候補変更でスコア更新 |
| P5 — Discovery & Invite | Find／Grow、募集要件、Invite／Request、Accept／Decline | チーム結成／競合がE2Eで動く |
| P6 — Workspace | Realtime Chat、AI Kickoff | 他チームを遮断し、メッセージ保存可 |
| P7 — Visual & QA | UI調整、レスポンシブ、空状態、QA、Playwright | Chrome実操作でデモシナリオ通過 |
| P8 — Submission | スクリーンショット、3分デモ動画、スライド、Devpost | 締切前に提出完了 |

### 15.1 時間不足時の機能優先順位

- **守る核**：Space検索・作成・Join → Profile → Smart Team → 本人意思によるInvite → Accept → Active → 動く審査デモ。
- **次に守る**：Find / Grow、Skill Gap、Replace、Course Space、Chat。
- **後回しにしてよい**：検索の高度なソート、多彩なチャート、代替案の数、Kickoffの再生成、詳細な通知・演出。
- **絶対に削らない**：Spaceの分離、本人同意、サーバー側認可、架空データの明示。

### 15.2 モデルの使い分け

- Claude Codeの利用可能な高性能モデル＋High effort：DB/RLS、Matching Space一意性、optimizer、招待のトランザクション、安全性のデバッグ。
- 速度重視のモデル：UI、フォーム、CRUD、CSS、テスト修正。モデル名とEffortは実機の`/model`等で確認。
- Codexは別worktreeでの独立レビュー・テストに利用可。Claude Codeと同ファイル同時編集は避ける。
- Phaseごとにlint、typecheck、unit tests、production build、Playwright、スクリーンショット確認、Gitコミットを実施する。

### 15.3 1フェーズを完了したとみなす条件

`画面だけ`ではなく、UI→API→DB→権限→エラー→実ブラウザ操作まで接続されていること。動かないボタンや固定数値を未完成のままデモに残さない。

---

## 16. 3分間の審査デモ／ピッチ構成

| 時間 | 見せるもの | メッセージ |
|---|---|---|
| 0:00–0:20 | 問題提起 | 前回のハッカソンではチーム探しだけで時間を失った |
| 0:20–0:45 | `TreeHacks 2027`を検索→結果ゼロ→Space新規作成 | 主催者の導入なしで学生が利用開始できる |
| 0:45–1:05 | 招待リンク／別ユーザーJoin／Participation | **同じSpace**に人が集まり、別イベントからは混ざらない |
| 1:05–1:45 | Smart Formation → 完成形提案＋Skill Coverage | 単なる似た人推薦ではなくチーム全体を最適化 |
| 1:45–2:05 | メンバーをReplace→チャート変化 | AIの説明可能性と対話的な編成 |
| 2:05–2:30 | Send Invites→別アカウントAccept／Decline | AIは提案、人が判断。辞退なら再推薦 |
| 2:30–2:45 | Active Team→Chat／AI Kickoff | 人探しから共同作業開始まで完結 |
| 2:45–3:00 | Course Project Space切替＋締め | 同じ基盤が授業課題にも適用可能 |

### 16.1 デモデータ

最初は `TreeHacks 2027`（最初はSpaceなし）を起点にし、招待リンクで架空参加者がJoinした状態を再現可能にする。別に `AI@USC Hackathon 2026` と `USC / Fall 2026 / CSCI 567 / Final Project` を用意し、検索・推薦がSpaceで分離されることを明示する。

例：Hackathon用の架空プロフィール32名、Course用16名程度をseed（数は開発の負荷に応じて調整可能）。同一人物が両Spaceに参加し、**Spaceごとに異なる熱量**を持つテストケースを含める。デモでは合成ユーザーと実ユーザーを明確に区別。

### 16.2 審査基準への対応

- **Impact & Campus Relevance 30%**：学生がチーム探しに時間を失う問題を解決。USC学生が他大学イベントを含めて使える。
- **Technical & AI 25%**：Structured extraction + semantic relevance + hard constraints + team-level optimization + grounded explanation。
- **Feasibility 25%**：USC／他大学の管理API不要。学生がSpaceを自作でき、同意・公開制御がある。
- **UX & Design 20%**：0件時の自然な導線、Space切替、募集・招待の明快さ、リアルタイムの可視化。

**審査で言わないこと**：『外部ハッカソンへの参加資格を自動認証する』『大学公式の学生名簿を連携済み』『95%のマッチング成功率』など、実装・検証していない主張。

---

## 17. 最終決定／実装で調整してよい点

### 今回ここまでを最終決定とする

1. 用途：Hackathon / Course Project・Homework。
2. Matching Spaceは**個別のイベント開催回／学期・科目・課題・適用Section**単位に分離。
3. 一般学生がSpaceを作成できる。`Not Found → Create Space` を必須導線とする。
4. Space作成者は自動的にSpace参加者になるが、Teamは自動作成せず、他チームの権限を持たない。
5. `Public-discoverable` と `Unlisted` を持つ。Courseは既定Unlisted + code。
6. `Find a Team`＝他の募集チームへ参加、`Grow My Team`＝自分の新規／既存チームの募集。
7. Smart Formationは同じSpaceのOpt-in候補から**完成形チーム**を提案。招待は本人が送信。
8. Active移行は必要な人の同意と最少人数の充足後。辞退者が出たら再推薦。
9. Team ChatとAI Kickoffを用意。趣味マッチングや強制一括割当は対象外。
10. Demo Modeを明示し、Space分離・Join・マッチング・招待・承認・チャットを実際に動かす。

### 実装時に調整してよい値

- 招待期限（例24〜72時間）、チームの最小／最大人数はイベント／課題規則に従ってSpaceごとに設定。
- Team Fitの重み（最初はヒューリスティック）、検索・フィルタの順番、AI説明モデル。
- Official URL未設定のSpaceの公開可否：少なくとも未確認ラベルを出し、重複警告を残す。
- チームOwnerによる権限委任、Archivedの履歴保持、外部通知は本番化フェーズで改善可能。
- Authは大学メール確認と安全なデモ切替を優先。正式USC SSO／外部主催者による本人確認は今回対象外。

**合意事項との境界**：本人の意思、Space分離、学生によるSpace作成、チーム編成の最終決定権を実装上の都合で勝手に削らない。

---

## 18. Claude Codeに渡す初回実装プロンプト（大会開始後）

> 本Markdown版をリポジトリに `TrojanMatch_Final_Spec.md` として配置し、**本仕様をSource of Truth**としてClaude Codeに渡す。大会の制作開始時間・利用ツールに関するRulesを守る。

```text
You are the lead engineer and UX designer for TrojanMatch, a USC-focused AI team formation platform.
Read TrojanMatch_Final_Spec.md completely and use it as the single source of truth.

Goal: build a deployable, polished, real product, not a collection of mock screens.
Two contexts: Hackathon and Course Project / Homework.

CRITICAL NEW DOMAIN CONCEPT: MATCHING SPACE.
- A Space is one specific hackathon edition OR one specific course/term/section/assignment.
- Students can search, join, or create a Space themselves. Organizer adoption is NOT required.
- If searching TreeHacks 2027 finds nothing, show Create New Space, check for duplicates,
  create a community-created Space, enroll the creator, then provide a shareable link.
- Creating a Space must NOT automatically create a Team.
- Users can participate without joining a Team. If alone, show honest no-match empty states.
- Space creator is NOT an organizer admin and cannot see private member profiles or team chats.
- Search, recommendation, invitations, team membership and chat must all be scoped and
  authorized server-side. Different hackathons or class assignments must never mix.

Main flows:
1. Global Profile + Space-specific Participation Preferences.
2. Find a Team: browse recruiting teams in the same Space and request to join.
3. Grow My Team: create a new team OR select one of MY authorized existing teams,
   analyze skill gaps, invite suitable students from the SAME Space.
4. Smart Team Formation: propose a COMPLETE team optimized for complementary skills,
   goals, interests, schedules, and constraints. Explain and visualize real scores.
   Allow member replacement and recompute the team score.
5. Invitations: explicit human action only. Pending/Accept/Decline/Expire/Cancel.
   Never auto-send invites or activate a forming team before required acceptance.
6. Active Team -> persistent realtime text chat -> AI Kickoff suggestions.

Suggested stack: Next.js, TypeScript, Tailwind, shadcn/ui, Supabase Auth/Postgres/
Realtime/RLS, server-side LLM structured output, embeddings if useful, deterministic
team optimizer, Vercel, Vitest and Playwright. Prefer a simpler secure architecture
if it improves delivery; explicitly explain trade-offs.

Requirements:
- Keep demo data clearly synthetic and resettable; no fake scores or fake invitations.
- Use space-specific hard constraints for EVERY matching endpoint.
- Course spaces should default to unlisted + join code.
- Preserve explicit consent and profile privacy; use no protected attributes in ranking.
- Use a restrained premium SaaS visual design with cardinal/gold accents.
- Add automated tests for cross-space leakage, duplicate spaces, cold start, team capacity,
  pending invitations, acceptance races, unauthorized chat, and recommender behavior.
- After each phase, run lint, typecheck, unit tests, build, Playwright browser tests,
  and inspect real screenshots at desktop/mobile sizes.
- Do not add out-of-scope features without explicit approval.

Start by reading the spec, inspecting the repository, and returning an implementation plan
mapped to the Acceptance Criteria. Then implement Phase 1 and verify its vertical slice.
```

### フェーズ別の追加プロンプト（必要なときに渡す）

- **Matching Spaces**：`Implement Search→Not Found→Create Space→Duplicate Check→Auto-Join→Empty State→Share Link. Test separate hackathon years and separate course assignments. Never grant admin privileges simply because a user created the Space.`
- **AI optimization**：`Build team-level optimization using only opted-in participants from the selected Space. Enforce hard constraints, score coverage, support replace/recompute, and show grounded explanations. Test that other Spaces never leak into candidates.`
- **Invitations**：`Build transactional invite/request/accept/decline states. Validate membership and capacity server-side; ensure no invitations are sent until the user clicks the send control.`
- **Visual QA**：`Open all key screens in a browser at 1440px and 375px; inspect actual screenshots and interactions. Fix visual and state errors, not only TypeScript/build warnings.`
- **Demo Polish**：`Produce a reproducible synthetic demo that includes Space creation from zero results, other users joining that Space, AI matching, invitation acceptance, team chat and course-space isolation.`

---

**Definition of Done**：学生が参加したいハッカソン／授業のSpaceを見つける（なければ作る）→自分のプロフィールを公開設定→同じSpaceの人だけからAIがチームを提案→本人が招待→相手が承認→チームが成立→チャットとAI Kickoffが使える。この一連の操作が、架空の固定表示ではなく、DB・状態遷移・アルゴリズムに基づいて動作すること。
