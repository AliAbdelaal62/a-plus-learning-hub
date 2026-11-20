export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      lessons: {
        Row: {
          created_at: string
          date: string
          end_time: string | null
          hours: number
          id: string
          notes: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["lesson_status"]
          student_currency: string | null
          student_id: string
          student_rate: number | null
          subject_id: string
          teacher_currency: string | null
          teacher_id: string
          teacher_rate: number | null
        }
        Insert: {
          created_at?: string
          date: string
          end_time?: string | null
          hours: number
          id?: string
          notes?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["lesson_status"]
          student_currency?: string | null
          student_id: string
          student_rate?: number | null
          subject_id: string
          teacher_currency?: string | null
          teacher_id: string
          teacher_rate?: number | null
        }
        Update: {
          created_at?: string
          date?: string
          end_time?: string | null
          hours?: number
          id?: string
          notes?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["lesson_status"]
          student_currency?: string | null
          student_id?: string
          student_rate?: number | null
          subject_id?: string
          teacher_currency?: string | null
          teacher_id?: string
          teacher_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          teacher_id: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          teacher_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          country: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          level: string | null
          major: string | null
          name: string
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["record_status"]
          university: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          level?: string | null
          major?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          university?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          level?: string | null
          major?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          university?: string | null
        }
        Relationships: []
      }
      subject_students: {
        Row: {
          student_id: string
          subject_id: string
        }
        Insert: {
          student_id: string
          subject_id: string
        }
        Update: {
          student_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_students_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          created_at: string
          id: string
          level: string | null
          name: string
          student_currency: string | null
          student_rate: number | null
          teacher_currency: string | null
          teacher_id: string | null
          teacher_rate: number | null
          type: Database["public"]["Enums"]["subject_type"]
          university: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string | null
          name: string
          student_currency?: string | null
          student_rate?: number | null
          teacher_currency?: string | null
          teacher_id?: string | null
          teacher_rate?: number | null
          type?: Database["public"]["Enums"]["subject_type"]
          university?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          level?: string | null
          name?: string
          student_currency?: string | null
          student_rate?: number | null
          teacher_currency?: string | null
          teacher_id?: string | null
          teacher_rate?: number | null
          type?: Database["public"]["Enums"]["subject_type"]
          university?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          currency: string
          email: string | null
          hourly_rate: number | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          specialty: string | null
          status: Database["public"]["Enums"]["record_status"]
        }
        Insert: {
          created_at?: string
          currency?: string
          email?: string | null
          hourly_rate?: number | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          specialty?: string | null
          status?: Database["public"]["Enums"]["record_status"]
        }
        Update: {
          created_at?: string
          currency?: string
          email?: string | null
          hourly_rate?: number | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          specialty?: string | null
          status?: Database["public"]["Enums"]["record_status"]
        }
        Relationships: []
      }
      timetable_entries: {
        Row: {
          created_at: string
          date: string | null
          end_time: string
          id: string
          notes: string | null
          recurring: boolean
          start_time: string
          student_id: string | null
          subject_id: string | null
          teacher_id: string | null
          weekday: number | null
        }
        Insert: {
          created_at?: string
          date?: string | null
          end_time: string
          id?: string
          notes?: string | null
          recurring?: boolean
          start_time: string
          student_id?: string | null
          subject_id?: string | null
          teacher_id?: string | null
          weekday?: number | null
        }
        Update: {
          created_at?: string
          date?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          recurring?: boolean
          start_time?: string
          student_id?: string | null
          subject_id?: string | null
          teacher_id?: string | null
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_entries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_entries_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_entries_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aplus_secure_acquire: {
        Args: { p_instance: string; p_token: string }
        Returns: Json
      }
      aplus_secure_checkpoint: {
        Args: {
          p_instance: string
          p_payload: Json
          p_token: string
          p_version: number
        }
        Returns: Json
      }
      aplus_secure_release: {
        Args: { p_instance: string; p_token: string }
        Returns: Json
      }
      can_edit: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_teacher_only: { Args: { _user_id: string }; Returns: boolean }
      my_teacher_id: { Args: never; Returns: string }
      remove_user_access: { Args: { _user_id: string }; Returns: undefined }
      set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _teacher_id?: string
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "coordinator" | "accountant" | "teacher"
      lesson_status: "completed" | "cancelled" | "rescheduled" | "no_show"
      record_status: "active" | "inactive"
      subject_type: "live" | "recorded" | "project"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "coordinator", "accountant", "teacher"],
      lesson_status: ["completed", "cancelled", "rescheduled", "no_show"],
      record_status: ["active", "inactive"],
      subject_type: ["live", "recorded", "project"],
    },
  },
} as const
