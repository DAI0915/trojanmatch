
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "invitations": {
                  Row: {
                    "actor_id": string,"created_at": string,"expires_at": string,"id": string,"kind": Database["public"]['Enums']["invite_kind"],"match_run_id": string | null,"message": string | null,"responded_at": string | null,"responded_by": string | null,"space_id": string,"status": Database["public"]['Enums']["invite_status"],"status_reason": string | null,"team_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"created_at"?: string,"expires_at": string,"id"?: string,"kind": Database["public"]['Enums']["invite_kind"],"match_run_id"?: string | null,"message"?: string | null,"responded_at"?: string | null,"responded_by"?: string | null,"space_id": string,"status"?: Database["public"]['Enums']["invite_status"],"status_reason"?: string | null,"team_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string,"created_at"?: string,"expires_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["invite_kind"],"match_run_id"?: string | null,"message"?: string | null,"responded_at"?: string | null,"responded_by"?: string | null,"space_id"?: string,"status"?: Database["public"]['Enums']["invite_status"],"status_reason"?: string | null,"team_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_actor_participant_fk"
      columns: ["space_id","actor_id"]
isOneToOne: false
      referencedRelation: "participations"
      referencedColumns: ["space_id","user_id"]
    },{
      foreignKeyName: "invitations_match_run_id_fkey"
      columns: ["match_run_id"]
isOneToOne: false
      referencedRelation: "match_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_responded_by_fkey"
      columns: ["responded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_team_space_fk"
      columns: ["team_id","space_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","space_id"]
    },{
      foreignKeyName: "invitations_user_participant_fk"
      columns: ["space_id","user_id"]
isOneToOne: false
      referencedRelation: "participations"
      referencedColumns: ["space_id","user_id"]
    }
                  ]
                },"kickoff_briefs": {
                  Row: {
                    "brief": NonNullable<Json>,"created_at": string,"generated_by": string,"id": string,"source": Database["public"]['Enums']["ai_source"],"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brief": NonNullable<Json>,"created_at"?: string,"generated_by"?: string,"id"?: string,"source": Database["public"]['Enums']["ai_source"],"team_id": string
                  }
                  Update: {
                    "brief"?: NonNullable<Json>,"created_at"?: string,"generated_by"?: string,"id"?: string,"source"?: Database["public"]['Enums']["ai_source"],"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "kickoff_briefs_generated_by_fkey"
      columns: ["generated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "kickoff_briefs_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"match_runs": {
                  Row: {
                    "algorithm_version": string,"candidate_count": number,"created_at": string,"id": string,"initiator_id": string,"input": NonNullable<Json>,"mode": Database["public"]['Enums']["match_mode"],"result": NonNullable<Json>,"space_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "algorithm_version": string,"candidate_count": number,"created_at"?: string,"id"?: string,"initiator_id": string,"input": NonNullable<Json>,"mode": Database["public"]['Enums']["match_mode"],"result": NonNullable<Json>,"space_id": string
                  }
                  Update: {
                    "algorithm_version"?: string,"candidate_count"?: number,"created_at"?: string,"id"?: string,"initiator_id"?: string,"input"?: NonNullable<Json>,"mode"?: Database["public"]['Enums']["match_mode"],"result"?: NonNullable<Json>,"space_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_runs_initiator_participant_fk"
      columns: ["space_id","initiator_id"]
isOneToOne: false
      referencedRelation: "participations"
      referencedColumns: ["space_id","user_id"]
    },{
      foreignKeyName: "match_runs_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "matching_spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"matching_spaces": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"identity_key": string,"join_policy": Database["public"]['Enums']["join_policy"],"max_team_size": number,"min_team_size": number,"scope": string,"slug": string,"status": Database["public"]['Enums']["space_status"],"team_deadline_at": string | null,"team_size_source": Database["public"]['Enums']["team_size_source"],"title": string,"title_normalized": string,"type": Database["public"]['Enums']["space_type"],"updated_at": string,"verification": string,"visibility": Database["public"]['Enums']["space_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"identity_key": string,"join_policy": Database["public"]['Enums']["join_policy"],"max_team_size"?: number,"min_team_size"?: number,"scope": string,"slug": string,"status"?: Database["public"]['Enums']["space_status"],"team_deadline_at"?: string | null,"team_size_source"?: Database["public"]['Enums']["team_size_source"],"title": string,"title_normalized": string,"type": Database["public"]['Enums']["space_type"],"updated_at"?: string,"verification"?: string,"visibility": Database["public"]['Enums']["space_visibility"]
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"identity_key"?: string,"join_policy"?: Database["public"]['Enums']["join_policy"],"max_team_size"?: number,"min_team_size"?: number,"scope"?: string,"slug"?: string,"status"?: Database["public"]['Enums']["space_status"],"team_deadline_at"?: string | null,"team_size_source"?: Database["public"]['Enums']["team_size_source"],"title"?: string,"title_normalized"?: string,"type"?: Database["public"]['Enums']["space_type"],"updated_at"?: string,"verification"?: string,"visibility"?: Database["public"]['Enums']["space_visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "matching_spaces_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "author_id": string,"body": string,"client_id": string | null,"created_at": string,"id": string,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string,"body": string,"client_id"?: string | null,"created_at"?: string,"id"?: string,"team_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"client_id"?: string | null,"created_at"?: string,"id"?: string,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"participations": {
                  Row: {
                    "accept_invites": boolean,"availability_override": (number)[] | null,"created_at": string,"desired_roles": (string)[],"goal": string | null,"goal_note": string | null,"id": string,"looking_for_team": boolean,"notes": string | null,"setup_completed": boolean,"smart_match_opt_in": boolean,"space_id": string,"topics": (string)[],"updated_at": string,"user_id": string,"visible_to_members": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "accept_invites"?: boolean,"availability_override"?: (number)[] | null,"created_at"?: string,"desired_roles"?: (string)[],"goal"?: string | null,"goal_note"?: string | null,"id"?: string,"looking_for_team"?: boolean,"notes"?: string | null,"setup_completed"?: boolean,"smart_match_opt_in"?: boolean,"space_id": string,"topics"?: (string)[],"updated_at"?: string,"user_id": string,"visible_to_members"?: boolean
                  }
                  Update: {
                    "accept_invites"?: boolean,"availability_override"?: (number)[] | null,"created_at"?: string,"desired_roles"?: (string)[],"goal"?: string | null,"goal_note"?: string | null,"id"?: string,"looking_for_team"?: boolean,"notes"?: string | null,"setup_completed"?: boolean,"smart_match_opt_in"?: boolean,"space_id"?: string,"topics"?: (string)[],"updated_at"?: string,"user_id"?: string,"visible_to_members"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "participations_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "matching_spaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "participations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "availability": (number)[],"bio": string | null,"created_at": string,"display_name": string,"experience": Database["public"]['Enums']["experience_level"] | null,"id": string,"interests": (string)[],"is_synthetic": boolean,"onboarded": boolean,"roles": (string)[],"scope": string,"skills": (string)[],"timezone": string,"university": string | null,"updated_at": string,"working_style": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "availability"?: (number)[],"bio"?: string | null,"created_at"?: string,"display_name": string,"experience"?: Database["public"]['Enums']["experience_level"] | null,"id": string,"interests"?: (string)[],"is_synthetic"?: boolean,"onboarded"?: boolean,"roles"?: (string)[],"scope"?: string,"skills"?: (string)[],"timezone"?: string,"university"?: string | null,"updated_at"?: string,"working_style"?: NonNullable<Json>
                  }
                  Update: {
                    "availability"?: (number)[],"bio"?: string | null,"created_at"?: string,"display_name"?: string,"experience"?: Database["public"]['Enums']["experience_level"] | null,"id"?: string,"interests"?: (string)[],"is_synthetic"?: boolean,"onboarded"?: boolean,"roles"?: (string)[],"scope"?: string,"skills"?: (string)[],"timezone"?: string,"university"?: string | null,"updated_at"?: string,"working_style"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"space_course_details": {
                  Row: {
                    "allowed_sections": (string)[],"assignment_key": string | null,"assignment_name": string,"course_code": string,"course_title": string | null,"instructions_url": string | null,"scope": string,"space_id": string,"term": string,"university": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed_sections": (string)[],"assignment_key"?: string | null,"assignment_name": string,"course_code": string,"course_title"?: string | null,"instructions_url"?: string | null,"scope": string,"space_id": string,"term": string,"university": string
                  }
                  Update: {
                    "allowed_sections"?: (string)[],"assignment_key"?: string | null,"assignment_name"?: string,"course_code"?: string,"course_title"?: string | null,"instructions_url"?: string | null,"scope"?: string,"space_id"?: string,"term"?: string,"university"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "space_course_details_space_fk"
      columns: ["space_id","scope"]
isOneToOne: false
      referencedRelation: "matching_spaces"
      referencedColumns: ["id","scope"]
    }
                  ]
                },"space_hackathon_details": {
                  Row: {
                    "edition_year": number,"ends_at": string,"format": Database["public"]['Enums']["hackathon_format"],"location": string | null,"official_url": string | null,"official_url_normalized": string | null,"organizer": string | null,"rules_url": string | null,"scope": string,"space_id": string,"starts_at": string,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "edition_year": number,"ends_at": string,"format": Database["public"]['Enums']["hackathon_format"],"location"?: string | null,"official_url"?: string | null,"official_url_normalized"?: string | null,"organizer"?: string | null,"rules_url"?: string | null,"scope": string,"space_id": string,"starts_at": string,"timezone": string
                  }
                  Update: {
                    "edition_year"?: number,"ends_at"?: string,"format"?: Database["public"]['Enums']["hackathon_format"],"location"?: string | null,"official_url"?: string | null,"official_url_normalized"?: string | null,"organizer"?: string | null,"rules_url"?: string | null,"scope"?: string,"space_id"?: string,"starts_at"?: string,"timezone"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "space_hackathon_details_space_fk"
      columns: ["space_id","scope"]
isOneToOne: false
      referencedRelation: "matching_spaces"
      referencedColumns: ["id","scope"]
    }
                  ]
                },"space_secrets": {
                  Row: {
                    "join_code": string,"space_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "join_code": string,"space_id": string
                  }
                  Update: {
                    "join_code"?: string,"space_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "space_secrets_space_id_fkey"
      columns: ["space_id"]
isOneToOne: true
      referencedRelation: "matching_spaces"
      referencedColumns: ["id"]
    }
                  ]
                },"team_members": {
                  Row: {
                    "can_recruit": boolean,"joined_at": string,"left_at": string | null,"role": Database["public"]['Enums']["team_member_role"],"space_id": string,"status": Database["public"]['Enums']["member_status"],"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "can_recruit"?: boolean,"joined_at"?: string,"left_at"?: string | null,"role"?: Database["public"]['Enums']["team_member_role"],"space_id": string,"status"?: Database["public"]['Enums']["member_status"],"team_id": string,"user_id": string
                  }
                  Update: {
                    "can_recruit"?: boolean,"joined_at"?: string,"left_at"?: string | null,"role"?: Database["public"]['Enums']["team_member_role"],"space_id"?: string,"status"?: Database["public"]['Enums']["member_status"],"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_members_participant_fk"
      columns: ["space_id","user_id"]
isOneToOne: false
      referencedRelation: "participations"
      referencedColumns: ["space_id","user_id"]
    },{
      foreignKeyName: "team_members_team_space_fk"
      columns: ["team_id","space_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","space_id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "activated_at": string | null,"activation_mode": Database["public"]['Enums']["activation_mode"] | null,"created_at": string,"description": string | null,"id": string,"name": string,"owner_id": string,"recruiting": boolean,"requirements": NonNullable<Json>,"space_id": string,"status": Database["public"]['Enums']["team_status"],"target_size": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activated_at"?: string | null,"activation_mode"?: Database["public"]['Enums']["activation_mode"] | null,"created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"owner_id": string,"recruiting"?: boolean,"requirements"?: NonNullable<Json>,"space_id": string,"status"?: Database["public"]['Enums']["team_status"],"target_size": number,"updated_at"?: string
                  }
                  Update: {
                    "activated_at"?: string | null,"activation_mode"?: Database["public"]['Enums']["activation_mode"] | null,"created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"owner_id"?: string,"recruiting"?: boolean,"requirements"?: NonNullable<Json>,"space_id"?: string,"status"?: Database["public"]['Enums']["team_status"],"target_size"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_owner_participant_fk"
      columns: ["space_id","owner_id"]
isOneToOne: false
      referencedRelation: "participations"
      referencedColumns: ["space_id","user_id"]
    },{
      foreignKeyName: "teams_space_id_fkey"
      columns: ["space_id"]
isOneToOne: false
      referencedRelation: "matching_spaces"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "activation_mode": "auto"|"finalized","ai_source": "llm"|"template","experience_level": "beginner"|"intermediate"|"advanced","hackathon_format": "in_person"|"online"|"hybrid","invite_kind": "invite"|"request","invite_status": "pending"|"accepted"|"declined"|"cancelled"|"expired","join_policy": "open"|"code","match_mode": "form"|"grow"|"replace"|"find","member_status": "active"|"left","space_status": "open"|"closed"|"archived","space_type": "hackathon"|"course","space_visibility": "public"|"unlisted","team_member_role": "owner"|"member","team_size_source": "creator_stated"|"app_default","team_status": "draft"|"forming"|"active"|"archived"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "activation_mode": ["auto", "finalized"],"ai_source": ["llm", "template"],"experience_level": ["beginner", "intermediate", "advanced"],"hackathon_format": ["in_person", "online", "hybrid"],"invite_kind": ["invite", "request"],"invite_status": ["pending", "accepted", "declined", "cancelled", "expired"],"join_policy": ["open", "code"],"match_mode": ["form", "grow", "replace", "find"],"member_status": ["active", "left"],"space_status": ["open", "closed", "archived"],"space_type": ["hackathon", "course"],"space_visibility": ["public", "unlisted"],"team_member_role": ["owner", "member"],"team_size_source": ["creator_stated", "app_default"],"team_status": ["draft", "forming", "active", "archived"]
          }
        }
} as const
